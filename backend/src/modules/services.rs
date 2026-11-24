//! Services of a bazaar, such as parking or drinks: admins keep the list (#256),
//! organizers pick from it. Events store the German names.

use axum::http::StatusCode;
use futures::FutureExt;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::access::require_admin;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Audience, Ctx, Registry};

const TOPIC: Topic = Topic::Table("event_services");
const MAX_NAME: usize = 60;

/// The services of a new instance (as in migration 0044): German name, English name.
const DEFAULTS: [(&str, &str); 6] = [
    ("Parkplatz", "Parking"),
    ("Skiservice", "Ski service"),
    ("Fahrradcodierung", "Bike coding"),
    ("Gastronomie", "Restaurant"),
    ("Imbiss", "Snacks"),
    ("Getränke", "Drinks"),
];

/// Puts back the default services, after a test database was emptied.
pub async fn insert_defaults(conn: &mut sqlx::PgConnection) -> sqlx::Result<()> {
    let (names, names_en): (Vec<&str>, Vec<&str>) = DEFAULTS.into_iter().unzip();
    sqlx::query(
        "INSERT INTO event_services (name, name_en, position)
         SELECT name, name_en, position FROM unnest($1::text[], $2::text[])
           WITH ORDINALITY AS d(name, name_en, position)
         ON CONFLICT (name) DO NOTHING",
    )
    .bind(names)
    .bind(names_en)
    .execute(conn)
    .await?;
    Ok(())
}

pub fn register(registry: &mut Registry) {
    register!(registry, Query "services.list" => list);
    registry.share("services.list", same_for_everybody);
    register!(registry, Query "services.listForAdmin" => list_for_admin);
    register!(registry, Mutation "services.save" => save);
    register!(registry, Mutation "services.move" => move_service);
    register!(registry, Mutation "services.delete" => delete);
}

fn same_for_everybody<'a>(
    _: &'a mut sqlx::PgConnection,
    _: Uuid,
    _: &'a serde_json::Value,
) -> BoxFuture<'a, sqlx::Result<Audience>> {
    async { Ok(Audience::Visitors) }.boxed()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Service {
    name: String,
    name_en: Option<String>,
}

/// The services organizers pick from, in the admins' order.
async fn list(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<Service>> {
    ctx.read(TOPIC);
    Ok(
        sqlx::query_as("SELECT name, name_en FROM event_services ORDER BY position, name")
            .fetch_all(ctx.conn())
            .await?,
    )
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminService {
    name: String,
    name_en: Option<String>,
    /// Bazars that have not ended yet and offer it: it cannot be deleted
    active_events: i64,
    /// Ended bazaars that offered it
    past_events: i64,
}

/// Admins: the services with the bazaars that offer them.
async fn list_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminService>> {
    require_admin(ctx).await?;
    ctx.read(TOPIC);
    ctx.read(Topic::Events);
    Ok(sqlx::query_as(
        "SELECT s.name, s.name_en,
           count(e.id) FILTER (WHERE e.end_date >= now()) AS active_events,
           count(e.id) FILTER (WHERE e.end_date < now()) AS past_events
         FROM event_services s LEFT JOIN events e ON s.name = ANY (e.services)
         GROUP BY s.name ORDER BY s.position, s.name",
    )
    .fetch_all(ctx.conn())
    .await?)
}

/// Whether all names are services an organizer may pick.
pub async fn check(conn: &mut sqlx::PgConnection, names: &[String]) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT name FROM unnest($1::text[]) AS name
         WHERE name NOT IN (SELECT name FROM event_services) LIMIT 1",
    )
    .bind(names)
    .fetch_optional(conn)
    .await?)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SaveArgs {
    /// The name of the service to change; none: a new one
    original: Option<String>,
    name: String,
    name_en: Option<String>,
}

/// Admins: adds a service or renames one; the bazaars that offer it keep it.
async fn save(ctx: &mut Ctx, args: SaveArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let name = args.name.trim();
    let name_en = args
        .name_en
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty());
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "services.nameLength",
            &[("max", &MAX_NAME.to_string())],
        ));
    }
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_services
           WHERE lower(name) = lower($1) AND name IS DISTINCT FROM $2)",
    )
    .bind(name)
    .bind(&args.original)
    .fetch_one(ctx.conn())
    .await?;
    if taken {
        return Err(AppError::bad_request("services.duplicate"));
    }
    match &args.original {
        None => {
            sqlx::query(
                "INSERT INTO event_services (name, name_en, position)
                 SELECT $1, $2, COALESCE(max(position), 0) + 1 FROM event_services",
            )
            .bind(name)
            .bind(name_en)
            .execute(ctx.conn())
            .await?;
        }
        Some(original) => {
            let updated =
                sqlx::query("UPDATE event_services SET name = $2, name_en = $3 WHERE name = $1")
                    .bind(original)
                    .bind(name)
                    .bind(name_en)
                    .execute(ctx.conn())
                    .await?;
            if updated.rows_affected() == 0 {
                return Err(AppError::not_found("notFound.service"));
            }
            if original != name {
                let events: Vec<Uuid> = sqlx::query_scalar(
                    "UPDATE events SET services = array_replace(services, $1, $2)
                     WHERE $1 = ANY (services) RETURNING id",
                )
                .bind(original)
                .bind(name)
                .fetch_all(ctx.conn())
                .await?;
                touch_events(ctx, &events);
            }
        }
    }
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MoveArgs {
    name: String,
    up: bool,
}

/// Admins: swaps a service with its neighbour above or below.
async fn move_service(ctx: &mut Ctx, args: MoveArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let names: Vec<String> =
        sqlx::query_scalar("SELECT name FROM event_services ORDER BY position, name")
            .fetch_all(ctx.conn())
            .await?;
    let Some(index) = names.iter().position(|name| *name == args.name) else {
        return Err(AppError::not_found("notFound.service"));
    };
    let other = if args.up {
        index.checked_sub(1)
    } else {
        Some(index + 1).filter(|other| *other < names.len())
    };
    let Some(other) = other else { return Ok(()) };
    let mut order = names;
    order.swap(index, other);
    sqlx::query(
        "UPDATE event_services s SET position = o.position
         FROM unnest($1::text[]) WITH ORDINALITY AS o(name, position) WHERE s.name = o.name",
    )
    .bind(&order)
    .execute(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DeleteArgs {
    name: String,
}

/// Admins: deletes a service no upcoming or running bazaar offers; ended bazaars lose it.
async fn delete(ctx: &mut Ctx, args: DeleteArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let active: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM events WHERE $1 = ANY (services) AND end_date >= now()",
    )
    .bind(&args.name)
    .fetch_one(ctx.conn())
    .await?;
    if active > 0 {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "services.inUse",
            &[("count", &active.to_string())],
        ));
    }
    let deleted = sqlx::query("DELETE FROM event_services WHERE name = $1")
        .bind(&args.name)
        .execute(ctx.conn())
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(AppError::not_found("notFound.service"));
    }
    let past: Vec<Uuid> = sqlx::query_scalar(
        "UPDATE events SET services = array_remove(services, $1)
         WHERE $1 = ANY (services) RETURNING id",
    )
    .bind(&args.name)
    .fetch_all(ctx.conn())
    .await?;
    touch_events(ctx, &past);
    ctx.touch(TOPIC);
    Ok(())
}

fn touch_events(ctx: &mut Ctx, events: &[Uuid]) {
    for id in events {
        ctx.touch(Topic::Event(*id));
    }
    if !events.is_empty() {
        ctx.touch(Topic::Events);
    }
}
