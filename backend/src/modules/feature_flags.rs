//! Feature flags. The flags themselves are read with `crate::flags`; this is the
//! public query, the admin area's list and switch (#256) and the internal setter.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::access::require_admin;
use crate::error::{AppError, AppResult};
use crate::flags::ADMIN_FLAGS;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::ms_opt;

const TOPIC: Topic = Topic::Table("feature_flags");

pub fn register(registry: &mut Registry) {
    register!(registry, Query "featureFlags.get" => get);
    register!(registry, Query "featureFlags.listForAdmin" => list_for_admin);
    register!(registry, Mutation "featureFlags.update" => update);
    register!(registry, InternalMutation "featureFlags.set" => set);
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GetArgs {
    key: Option<String>,
}

/// One flag (`{key: value}`, `{}` if unset) or all flags.
async fn get(ctx: &mut Ctx, args: GetArgs) -> AppResult<BTreeMap<String, bool>> {
    ctx.read(TOPIC);
    let rows: Vec<(String, bool)> = match args.key {
        Some(key) => {
            sqlx::query_as("SELECT key, value FROM feature_flags WHERE key = $1")
                .bind(key)
                .fetch_all(ctx.conn())
                .await?
        }
        None => {
            sqlx::query_as("SELECT key, value FROM feature_flags")
                .fetch_all(ctx.conn())
                .await?
        }
    };
    Ok(rows.into_iter().collect())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SetArgs {
    key: String,
    value: bool,
    description: Option<String>,
}

async fn set(ctx: &mut Ctx, args: SetArgs) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO feature_flags (key, value, description) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description",
    )
    .bind(args.key)
    .bind(args.value)
    .bind(args.description)
    .execute(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminFlag {
    key: &'static str,
    value: bool,
    /// Never switched: the value is the default of the code
    is_default: bool,
    #[serde(with = "ms_opt")]
    updated_at: Option<DateTime<Utc>>,
    updated_by: Option<String>,
}

#[derive(sqlx::FromRow)]
struct StoredFlag {
    key: String,
    value: bool,
    updated_at: Option<DateTime<Utc>>,
    updated_by: Option<String>,
}

/// Admins: the flags they may switch, in a fixed order, with who changed them last.
async fn list_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminFlag>> {
    require_admin(ctx).await?;
    ctx.read(TOPIC);
    let keys: Vec<&str> = ADMIN_FLAGS.iter().map(|(key, _)| *key).collect();
    let rows: Vec<StoredFlag> = sqlx::query_as(
        "SELECT f.key, f.value, f.updated_at,
           COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.name, u.email)
             AS updated_by
         FROM feature_flags f LEFT JOIN users u ON u.id = f.updated_by
         WHERE f.key = ANY($1)",
    )
    .bind(&keys)
    .fetch_all(ctx.conn())
    .await?;
    Ok(ADMIN_FLAGS
        .iter()
        .map(|(key, default)| {
            let row = rows.iter().find(|row| row.key == *key);
            AdminFlag {
                key,
                value: row.map_or(*default, |row| row.value),
                is_default: row.is_none(),
                updated_at: row.and_then(|row| row.updated_at),
                updated_by: row.and_then(|row| row.updated_by.clone()),
            }
        })
        .collect())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateArgs {
    key: String,
    value: bool,
}

/// Admins: switches one of the flags of the admin area; takes effect at once.
async fn update(ctx: &mut Ctx, args: UpdateArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    if !ADMIN_FLAGS.iter().any(|(key, _)| *key == args.key) {
        return Err(AppError::bad_request("featureFlags.unknown"));
    }
    sqlx::query(
        "INSERT INTO feature_flags (key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by",
    )
    .bind(&args.key)
    .bind(args.value)
    .bind(admin)
    .execute(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(())
}
