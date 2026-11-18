//! Product categories.

use chrono::{DateTime, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::types::Json;
use uuid::Uuid;

use super::access::require_admin;
use super::category_fields::{self, CategoryField, FieldIndex};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Audience, Ctx, Registry};
use crate::shape::{Id, ms};

const TOPIC: Topic = Topic::Table("categories");

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "categories.createCategory" => create_category);
    register!(registry, Mutation "categories.updateCategory" => update_category);
    register!(registry, Mutation "categories.deleteCategory" => delete_category);
    register!(registry, Query "categories.listForAdmin" => list_for_admin);
    register!(registry, Query "categories.getAllCategories" => get_all_categories);
    registry.share("categories.getAllCategories", same_for_everybody);
    register!(registry, Query "categories.getCategoryLabel" => get_category_label);
    register!(registry, Query "categories.getCategoryId" => get_category_id);
    register!(registry, Query "categories.listFields" => list_fields);
    registry.share("categories.listFields", same_for_everybody);
    register!(registry, Query "categories.listFieldsForAdmin" => list_fields_for_admin);
    register!(registry, Mutation "categories.saveField" => save_field);
    register!(registry, Mutation "categories.deleteField" => delete_field);
    register!(registry, InternalMutation "categories.seedCategories" => seed_categories);
    register!(registry, InternalMutation "categories.seedIfEmpty" => seed_if_empty);
}

/// Names in other languages. `label` is the one shown when a language has no translation.
#[skip_serializing_none]
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Translations {
    pub en: Option<String>,
}

impl Translations {
    fn trimmed(self) -> Self {
        Self {
            en: self
                .en
                .map(|name| name.trim().to_owned())
                .filter(|name| !name.is_empty()),
        }
    }
}

#[skip_serializing_none]
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    pub label: String,
    #[serde(rename = "parentCategory")]
    pub parent_id: Option<Uuid>,
    #[serde(with = "ms")]
    pub updated_at: DateTime<Utc>,
    pub translations: Json<Translations>,
    /// Ids of the extra fields an admin picked; unset: those of the main category
    pub fields: Option<Vec<String>>,
    /// The extra fields its items have, from its own choice or its main category
    #[sqlx(skip)]
    #[serde(default)]
    pub field_list: Vec<CategoryField>,
}

/// Fills in the fields each category ends up with.
fn with_fields<'a>(categories: impl Iterator<Item = &'a mut Category>, index: &FieldIndex) {
    for category in categories {
        category.field_list = index.fields(category.id);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    label: String,
    parent_category: Option<Id>,
    translations: Option<Translations>,
    fields: Option<Vec<String>>,
}

/// The extra fields an admin picked, checked; None: those of the main category.
async fn checked_fields(
    ctx: &mut Ctx,
    fields: Option<Vec<String>>,
) -> AppResult<Option<Vec<String>>> {
    let Some(ids) = fields else {
        return Ok(None);
    };
    let definitions = category_fields::load_definitions(ctx.conn()).await?;
    category_fields::checked_selection(&ids, &definitions)
        .map(Some)
        .map_err(AppError::bad_request)
}

fn clean_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty() {
        return Err(AppError::bad_request("category.labelEmpty"));
    }
    Ok(label.to_owned())
}

async fn find_by_label(ctx: &mut Ctx, label: &str) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar("SELECT id FROM categories WHERE label = $1 ORDER BY created_at LIMIT 1")
        .bind(label)
        .fetch_optional(ctx.conn())
        .await
}

/// Admins only. Returns the existing category if the label exists already.
async fn create_category(ctx: &mut Ctx, args: CreateArgs) -> AppResult<Uuid> {
    require_admin(ctx).await?;
    let label = clean_label(&args.label)?;
    let fields = checked_fields(ctx, args.fields).await?;
    if let Some(existing) = find_by_label(ctx, &label).await? {
        return Ok(existing);
    }
    let parent = args.parent_category.map(|parent| parent.0);
    if let Some(parent) = parent {
        check_parent(ctx, None, parent).await?;
    }
    let id = sqlx::query_scalar(
        "INSERT INTO categories (label, parent_id, translations, fields) VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(&label)
    .bind(parent)
    .bind(Json(args.translations.unwrap_or_default().trimmed()))
    .bind(fields)
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateArgs {
    category_id: Id,
    label: String,
    translations: Translations,
    /// The main category; none makes it a main category itself
    #[serde(default)]
    parent_category: Option<Id>,
    /// The extra fields; none: those of the main category
    #[serde(default)]
    fields: Option<Vec<String>>,
}

/// Categories have one level of sub-categories, so lists stay short and grouped: the parent
/// must be a main category, and a category with sub-categories cannot become one itself.
async fn check_parent(ctx: &mut Ctx, category: Option<Uuid>, parent: Uuid) -> AppResult<()> {
    let parent_of_parent: Option<Option<Uuid>> =
        sqlx::query_scalar("SELECT parent_id FROM categories WHERE id = $1")
            .bind(parent)
            .fetch_optional(ctx.conn())
            .await?;
    let Some(parent_of_parent) = parent_of_parent else {
        return Err(AppError::not_found("notFound.category"));
    };
    if Some(parent) == category || parent_of_parent.is_some() {
        return Err(AppError::bad_request("category.parentNotMain"));
    }
    if let Some(category) = category {
        let has_children: bool =
            sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories WHERE parent_id = $1)")
                .bind(category)
                .fetch_one(ctx.conn())
                .await?;
        if has_children {
            return Err(AppError::bad_request("category.hasSubcategories"));
        }
    }
    Ok(())
}

/// Items go into a category without sub-categories: a main category only groups them.
pub async fn assert_for_items(conn: &mut sqlx::PgConnection, category: Uuid) -> AppResult<()> {
    let has_children: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories WHERE parent_id = $1)")
            .bind(category)
            .fetch_one(conn)
            .await?;
    if has_children {
        return Err(AppError::bad_request("product.chooseSubcategory"));
    }
    Ok(())
}

/// Admins only. Items and bazaars point to the id and follow; sales keep the name they had.
async fn update_category(ctx: &mut Ctx, args: UpdateArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let label = clean_label(&args.label)?;
    let fields = checked_fields(ctx, args.fields).await?;
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM categories WHERE lower(label) = lower($1) AND id <> $2)",
    )
    .bind(&label)
    .bind(args.category_id.0)
    .fetch_one(ctx.conn())
    .await?;
    if taken {
        return Err(AppError::bad_request("category.labelTaken"));
    }
    let parent = args.parent_category.map(|parent| parent.0);
    if let Some(parent) = parent {
        check_parent(ctx, Some(args.category_id.0), parent).await?;
    }
    let updated = sqlx::query(
        "UPDATE categories SET label = $2, translations = $3, parent_id = $4, fields = $5,
           updated_at = now()
         WHERE id = $1",
    )
    .bind(args.category_id.0)
    .bind(&label)
    .bind(Json(args.translations.trimmed()))
    .bind(parent)
    .bind(fields)
    .execute(ctx.conn())
    .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::not_found("notFound.category"));
    }
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteArgs {
    category_id: Id,
}

/// Admins only, and only what nothing uses: items and bazaars need their category, and a
/// sub-category would lose the fields it inherits. Sales keep the name they recorded.
async fn delete_category(ctx: &mut Ctx, args: DeleteArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let id = args.category_id.0;
    let (exists, in_use, others): (bool, bool, bool) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1),
                EXISTS (SELECT 1 FROM products WHERE category_id = $1)
                  OR EXISTS (SELECT 1 FROM event_categories WHERE category_id = $1)
                  OR EXISTS (SELECT 1 FROM categories WHERE parent_id = $1),
                EXISTS (SELECT 1 FROM categories WHERE id <> $1)",
    )
    .bind(id)
    .fetch_one(ctx.conn())
    .await?;
    if !exists {
        return Err(AppError::not_found("notFound.category"));
    }
    if in_use {
        return Err(AppError::bad_request("category.inUse"));
    }
    // No bazaar could be created without one, and the next start would bring the defaults back
    if !others {
        return Err(AppError::bad_request("category.lastOne"));
    }
    sqlx::query("DELETE FROM categories WHERE id = $1")
        .bind(id)
        .execute(ctx.conn())
        .await?;
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminCategory {
    #[sqlx(flatten)]
    #[serde(flatten)]
    category: Category,
    product_count: i64,
    event_count: i64,
    child_count: i64,
}

async fn list_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminCategory>> {
    require_admin(ctx).await?;
    ctx.read(TOPIC);
    let mut rows: Vec<AdminCategory> = sqlx::query_as(
        "SELECT c.id, c.created_at, c.label, c.parent_id, c.updated_at, c.translations, c.fields,
           (SELECT count(*) FROM products p WHERE p.category_id = c.id) AS product_count,
           (SELECT count(*) FROM event_categories e WHERE e.category_id = c.id) AS event_count,
           (SELECT count(*) FROM categories s WHERE s.parent_id = c.id) AS child_count
         FROM categories c ORDER BY c.created_at, c.id",
    )
    .fetch_all(ctx.conn())
    .await?;
    let index = FieldIndex::load(ctx.conn()).await?;
    with_fields(rows.iter_mut().map(|row| &mut row.category), &index);
    Ok(rows)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

fn same_for_everybody<'a>(
    _: &'a mut sqlx::PgConnection,
    _: Uuid,
    _: &'a serde_json::Value,
) -> BoxFuture<'a, sqlx::Result<Audience>> {
    async { Ok(Audience::Visitors) }.boxed()
}

async fn get_all_categories(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<Category>> {
    ctx.read(TOPIC);
    let mut categories: Vec<Category> = sqlx::query_as(
        "SELECT c.id, c.created_at, c.label, c.parent_id, c.updated_at, c.translations, c.fields
         FROM categories c ORDER BY c.created_at, c.id",
    )
    .fetch_all(ctx.conn())
    .await?;
    let index = FieldIndex::load(ctx.conn()).await?;
    with_fields(categories.iter_mut(), &index);
    Ok(categories)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LabelArgs {
    category_id: Id,
}

async fn get_category_label(ctx: &mut Ctx, args: LabelArgs) -> AppResult<Option<String>> {
    ctx.read(TOPIC);
    Ok(
        sqlx::query_scalar("SELECT label FROM categories WHERE id = $1")
            .bind(args.category_id.0)
            .fetch_optional(ctx.conn())
            .await?,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdArgs {
    category_label: String,
}

async fn get_category_id(ctx: &mut Ctx, args: IdArgs) -> AppResult<Option<Uuid>> {
    ctx.read(TOPIC);
    Ok(find_by_label(ctx, &args.category_label).await?)
}

/// The extra fields admins defined, e.g. for the required fields of a bazaar.
async fn list_fields(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<CategoryField>> {
    ctx.read(TOPIC);
    Ok(category_fields::load_definitions(ctx.conn()).await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminField {
    #[serde(flatten)]
    field: CategoryField,
    /// Categories that picked it themselves
    category_count: i64,
}

async fn list_fields_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminField>> {
    require_admin(ctx).await?;
    ctx.read(TOPIC);
    let definitions = category_fields::load_definitions(ctx.conn()).await?;
    let counts: Vec<(String, i64)> =
        sqlx::query_as("SELECT f, count(*) FROM categories, unnest(fields) AS f GROUP BY f")
            .fetch_all(ctx.conn())
            .await?;
    Ok(definitions
        .into_iter()
        .map(|field| AdminField {
            category_count: counts
                .iter()
                .find(|(id, _)| id == &field.id)
                .map_or(0, |(_, count)| *count),
            field,
        })
        .collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FieldArgs {
    /// None: a new field
    field_id: Option<String>,
    label: String,
    label_en: Option<String>,
    placeholder: Option<String>,
    placeholder_en: Option<String>,
    hint: Option<String>,
    hint_en: Option<String>,
    short: bool,
}

/// Trimmed, None when empty.
fn text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

/// Admins only. Creates or changes an extra field; its key stays, so items keep their values.
async fn save_field(ctx: &mut Ctx, args: FieldArgs) -> AppResult<String> {
    require_admin(ctx).await?;
    let label =
        text(Some(args.label)).ok_or_else(|| AppError::bad_request("category.labelEmpty"))?;
    let values = (
        label,
        text(args.label_en),
        text(args.placeholder),
        text(args.placeholder_en),
        text(args.hint),
        text(args.hint_en),
    );
    let id = match args.field_id {
        Some(id) => {
            let updated = sqlx::query(
                "UPDATE category_field_definitions SET label = $2, label_en = $3, placeholder = $4,
                   placeholder_en = $5, hint = $6, hint_en = $7, short = $8
                 WHERE id = $1",
            )
            .bind(&id)
            .bind(&values.0)
            .bind(&values.1)
            .bind(&values.2)
            .bind(&values.3)
            .bind(&values.4)
            .bind(&values.5)
            .bind(args.short)
            .execute(ctx.conn())
            .await?;
            if updated.rows_affected() == 0 {
                return Err(AppError::not_found("notFound.categoryField"));
            }
            id
        }
        None => {
            // Its own key: the value of a new field is stored apart from all others
            let id = format!("f{}", &Uuid::new_v4().simple().to_string()[..10]);
            sqlx::query(
                "INSERT INTO category_field_definitions
                   (id, key, label, label_en, placeholder, placeholder_en, hint, hint_en, short,
                    position)
                 VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8,
                   (SELECT coalesce(max(position), 0) + 1 FROM category_field_definitions))",
            )
            .bind(&id)
            .bind(&values.0)
            .bind(&values.1)
            .bind(&values.2)
            .bind(&values.3)
            .bind(&values.4)
            .bind(&values.5)
            .bind(args.short)
            .execute(ctx.conn())
            .await?;
            id
        }
    };
    ctx.touch(TOPIC);
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteFieldArgs {
    field_id: String,
}

/// Admins only, and only a field no category picked; items keep their values.
async fn delete_field(ctx: &mut Ctx, args: DeleteFieldArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let in_use: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories WHERE $1 = ANY (fields))")
            .bind(&args.field_id)
            .fetch_one(ctx.conn())
            .await?;
    if in_use {
        return Err(AppError::bad_request("categoryField.inUse"));
    }
    let deleted = sqlx::query("DELETE FROM category_field_definitions WHERE id = $1")
        .bind(&args.field_id)
        .execute(ctx.conn())
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(AppError::not_found("notFound.categoryField"));
    }
    ctx.touch(TOPIC);
    Ok(())
}

// The field ids of the defaults, as in migration 0034
const BIKE: &[&str] = &["frameNumber", "frameSize", "wheelSize", "brand", "color"];
const CLOTHING: &[&str] = &["clothingSize", "brand", "color"];
const SHOES: &[&str] = &["shoeSize", "brand"];
const SPORT: &[&str] = &["sportSize", "brand", "color"];
const ELECTRONICS: &[&str] = &["brand", "model"];
const NONE: &[&str] = &[];

/// A default category: German label, English name, the label of its main category and the
/// ids of its extra fields (None: those of the main category).
pub struct DefaultCategory {
    pub label: &'static str,
    pub en: &'static str,
    pub parent: Option<&'static str>,
    pub fields: Option<&'static [&'static str]>,
}

const fn main(
    label: &'static str,
    en: &'static str,
    fields: Option<&'static [&'static str]>,
) -> DefaultCategory {
    DefaultCategory {
        label,
        en,
        parent: None,
        fields,
    }
}

const fn sub(
    parent: &'static str,
    label: &'static str,
    en: &'static str,
    fields: Option<&'static [&'static str]>,
) -> DefaultCategory {
    DefaultCategory {
        label,
        en,
        parent: Some(parent),
        fields,
    }
}

/// The default categories, main categories before their sub-categories; adds the missing
/// ones, safe to run repeatedly: `bazarpro-backend run categories.seedCategories`.
/// Same tree as migration 0034.
pub const DEFAULT_CATEGORIES: [DefaultCategory; COUNT] = [
    main("Kleidung", "Clothing", Some(CLOTHING)),
    sub("Kleidung", "Babykleidung", "Baby clothes", None),
    sub("Kleidung", "Kinderkleidung", "Children's clothes", None),
    sub("Kleidung", "Damenkleidung", "Women's clothes", None),
    sub("Kleidung", "Herrenkleidung", "Men's clothes", None),
    sub("Kleidung", "Umstandsmode", "Maternity wear", None),
    main("Schuhe", "Shoes", Some(SHOES)),
    sub("Schuhe", "Kinderschuhe", "Children's shoes", None),
    sub("Schuhe", "Damenschuhe", "Women's shoes", None),
    sub("Schuhe", "Herrenschuhe", "Men's shoes", None),
    sub("Schuhe", "Sportschuhe", "Sports shoes", None),
    main("Sport", "Sports", Some(SPORT)),
    sub("Sport", "Wintersport", "Winter sports", None),
    sub("Sport", "Skischuhe", "Ski boots", Some(SHOES)),
    sub("Sport", "Sportbekleidung", "Sportswear", Some(CLOTHING)),
    sub("Sport", "Helme & Protektoren", "Helmets & protectors", None),
    sub("Sport", "Ballsport", "Ball sports", None),
    sub("Sport", "Fitness", "Fitness", None),
    sub("Sport", "Camping & Outdoor", "Camping & outdoor", None),
    sub("Sport", "Weitere Sportarten", "Other sports", None),
    main("Fahrräder", "Bikes", Some(BIKE)),
    sub(
        "Fahrräder",
        "Cityräder & Hollandräder",
        "City & Dutch bikes",
        None,
    ),
    sub("Fahrräder", "Trekkingräder", "Trekking bikes", None),
    sub(
        "Fahrräder",
        "Mountainbikes (MTB)",
        "Mountain bikes (MTB)",
        None,
    ),
    sub(
        "Fahrräder",
        "Rennräder & Gravelbikes",
        "Road & gravel bikes",
        None,
    ),
    sub("Fahrräder", "BMX & Dirtbikes", "BMX & dirt bikes", None),
    sub("Fahrräder", "Falträder & Klappräder", "Folding bikes", None),
    sub(
        "Fahrräder",
        "Kinder- & Jugendräder",
        "Children's & youth bikes",
        None,
    ),
    sub("Fahrräder", "E-Bikes & Pedelecs", "E-bikes", None),
    sub("Fahrräder", "Lastenräder", "Cargo bikes", None),
    sub("Fahrräder", "Fahrradanhänger", "Bike trailers", Some(NONE)),
    sub(
        "Fahrräder",
        "Fahrrad-Kindersitze",
        "Child bike seats",
        Some(NONE),
    ),
    sub(
        "Fahrräder",
        "Fahrradzubehör",
        "Bike accessories",
        Some(NONE),
    ),
    main("Kinderfahrzeuge", "Children's vehicles", None),
    sub("Kinderfahrzeuge", "Laufräder", "Balance bikes", Some(BIKE)),
    sub("Kinderfahrzeuge", "Roller & Scooter", "Scooters", None),
    sub("Kinderfahrzeuge", "Einräder", "Unicycles", None),
    sub(
        "Kinderfahrzeuge",
        "Bobbycars & Rutschfahrzeuge",
        "Ride-on toys",
        None,
    ),
    main("Baby & Kind", "Baby & child", None),
    sub(
        "Baby & Kind",
        "Kinderwagen & Buggys",
        "Prams & buggies",
        None,
    ),
    sub("Baby & Kind", "Autokindersitze", "Car seats", None),
    sub("Baby & Kind", "Babyausstattung", "Baby gear", None),
    main("Elektronik", "Electronics", Some(ELECTRONICS)),
    sub("Elektronik", "Handys & Smartphones", "Mobile phones", None),
    sub(
        "Elektronik",
        "Computer & Tablets",
        "Computers & tablets",
        None,
    ),
    sub("Elektronik", "Foto & Kamera", "Photo & camera", None),
    sub(
        "Elektronik",
        "Konsolen & Videospiele",
        "Consoles & video games",
        None,
    ),
    sub("Elektronik", "Audio & HiFi", "Audio & hi-fi", None),
    sub(
        "Elektronik",
        "Weitere Elektronik",
        "Other electronics",
        None,
    ),
    main("Bücher", "Books", None),
    sub(
        "Bücher",
        "Kinder- & Jugendbücher",
        "Children's & youth books",
        None,
    ),
    sub("Bücher", "Romane", "Novels", None),
    sub("Bücher", "Sachbücher", "Non-fiction", None),
    sub("Bücher", "Kochbücher", "Cookbooks", None),
    sub("Bücher", "Comics", "Comics", None),
    sub("Bücher", "Weitere Bücher", "Other books", None),
    main("Spielzeug", "Toys", None),
    sub("Spielzeug", "Babyspielzeug", "Baby toys", None),
    sub("Spielzeug", "Puppen & Plüsch", "Dolls & plush", None),
    sub(
        "Spielzeug",
        "Lego & Bausteine",
        "Lego & building blocks",
        None,
    ),
    sub("Spielzeug", "Spiele & Puzzles", "Games & puzzles", None),
    sub("Spielzeug", "Outdoor-Spielzeug", "Outdoor toys", None),
    sub("Spielzeug", "Weiteres Spielzeug", "Other toys", None),
    main("Möbel", "Furniture", None),
    sub("Möbel", "Kindermöbel", "Children's furniture", None),
    sub("Möbel", "Wohnzimmermöbel", "Living room", None),
    sub("Möbel", "Schlafzimmermöbel", "Bedroom", None),
    sub("Möbel", "Büromöbel", "Office furniture", None),
    sub("Möbel", "Gartenmöbel", "Garden furniture", None),
    sub("Möbel", "Weitere Möbel", "Other furniture", None),
    main("Haushalt", "Household", None),
    sub("Haushalt", "Küche & Kochen", "Kitchen & cooking", None),
    sub("Haushalt", "Dekoration", "Decoration", None),
    sub("Haushalt", "Heimtextilien", "Home textiles", None),
    sub("Haushalt", "Werkzeug & Garten", "Tools & garden", None),
    sub(
        "Haushalt",
        "Weiteres für den Haushalt",
        "Other household goods",
        None,
    ),
    main("Accessoires", "Accessories", None),
    sub(
        "Accessoires",
        "Taschen & Rucksäcke",
        "Bags & backpacks",
        None,
    ),
    sub(
        "Accessoires",
        "Schmuck & Uhren",
        "Jewellery & watches",
        None,
    ),
    sub("Accessoires", "Mützen & Schals", "Hats & scarves", None),
    sub("Accessoires", "Sonnenbrillen", "Sunglasses", None),
    sub("Accessoires", "Gürtel", "Belts", None),
    sub(
        "Accessoires",
        "Weitere Accessoires",
        "Other accessories",
        None,
    ),
    main("Freizeit & Hobby", "Leisure & hobbies", None),
    sub(
        "Freizeit & Hobby",
        "Musikinstrumente",
        "Musical instruments",
        None,
    ),
    sub("Freizeit & Hobby", "Filme & Musik", "Films & music", None),
    sub(
        "Freizeit & Hobby",
        "Basteln & Handarbeit",
        "Crafts & needlework",
        None,
    ),
    sub("Freizeit & Hobby", "Sammeln", "Collectibles", None),
    main("Sonstiges", "Other", None),
];
const COUNT: usize = 89;

async fn seed_categories(ctx: &mut Ctx, _: NoArgs) -> AppResult<&'static str> {
    insert_default_tree(ctx, false).await?;
    Ok("Categories seeded successfully")
}

/// The label of a default category in the language of the instance.
pub fn default_label(german: &str, english: bool) -> &str {
    match DEFAULT_CATEGORIES.iter().find(|c| c.label == german) {
        Some(category) if english => category.en,
        _ => german,
    }
}

/// Adds the missing default categories with their main categories. `english`: an English
/// instance or demo, labelled with the English names and without translations.
pub async fn insert_default_tree(ctx: &mut Ctx, english: bool) -> sqlx::Result<()> {
    category_fields::insert_default_fields(ctx.conn()).await?;
    for (position, category) in DEFAULT_CATEGORIES.iter().enumerate() {
        let label = default_label(category.label, english);
        if find_by_label(ctx, label).await?.is_some() {
            continue;
        }
        // Main categories come first; a renamed or deleted one leaves the sub-category on top
        let parent = match category.parent {
            Some(parent) => find_by_label(ctx, default_label(parent, english)).await?,
            None => None,
        };
        let fields: Option<Vec<String>> = category
            .fields
            .map(|ids| ids.iter().map(|id| (*id).to_owned()).collect());
        // Lists follow the creation time, and one run is one transaction with one now()
        sqlx::query(
            "INSERT INTO categories (label, parent_id, translations, fields, created_at)
             VALUES ($1, $2, $3, $4, now() + $5 * interval '1 millisecond')",
        )
        .bind(label)
        .bind(parent)
        .bind(Json(Translations {
            en: (!english).then(|| category.en.to_owned()),
        }))
        .bind(fields)
        .bind(position as f64)
        .execute(ctx.conn())
        .await?;
    }
    ctx.touch(TOPIC);
    Ok(())
}

/// On every start of the server: without categories no bazaar can be created, and the app
/// has no page to add them. An instance that already has categories keeps exactly those.
async fn seed_if_empty(ctx: &mut Ctx, args: NoArgs) -> AppResult<&'static str> {
    let any: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories)")
        .fetch_one(ctx.conn())
        .await?;
    if any {
        return Ok("Categories already exist");
    }
    seed_categories(ctx, args).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_tree_is_one_level_deep_and_names_known_fields() {
        let known = [
            "frameNumber",
            "frameSize",
            "wheelSize",
            "brand",
            "color",
            "clothingSize",
            "shoeSize",
            "sportSize",
            "model",
        ];
        for (index, category) in DEFAULT_CATEGORIES.iter().enumerate() {
            for id in category.fields.unwrap_or_default() {
                assert!(known.contains(id), "{} {id}", category.label);
            }
            if let Some(parent) = category.parent {
                let main = DEFAULT_CATEGORIES
                    .iter()
                    .position(|c| c.label == parent)
                    .unwrap();
                assert!(DEFAULT_CATEGORIES[main].parent.is_none(), "{parent}");
                assert!(main < index, "{parent} before {}", category.label);
            }
        }
        // Labels are unique, in German and in English
        for english in [false, true] {
            let mut labels: Vec<_> = DEFAULT_CATEGORIES
                .iter()
                .map(|c| default_label(c.label, english))
                .collect();
            labels.sort_unstable();
            labels.dedup();
            assert_eq!(labels.len(), DEFAULT_CATEGORIES.len());
        }
    }
}
