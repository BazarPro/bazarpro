//! Extra item fields per category, e.g. frame number for bikes. Admins define the fields
//! (category_field_definitions) and pick them per category; a sub-category without its own
//! choice takes the fields of its main category.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::Serialize;
use serde_with::skip_serializing_none;
use uuid::Uuid;

/// Longest value of a field.
pub const MAX_VALUE_LENGTH: usize = 120;
/// Longest value of a short field such as a size, e.g. "134/140" or "160 cm"; longer ones
/// would not fit on the labels. Same as MAX_SHORT_LENGTH in src/shared/categoryFields.ts.
pub const MAX_SHORT_LENGTH: usize = 7;

/// A field an admin defined, with its texts in German and English.
#[skip_serializing_none]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CategoryField {
    /// Picked by categories, e.g. "clothingSize"
    #[serde(rename = "_id")]
    pub id: String,
    /// Under which the value is stored on the item; sizes share "size", so an item keeps
    /// its size when it moves to another category
    pub key: String,
    pub label: String,
    pub label_en: Option<String>,
    pub placeholder: Option<String>,
    pub placeholder_en: Option<String>,
    pub hint: Option<String>,
    pub hint_en: Option<String>,
    /// At most MAX_SHORT_LENGTH characters, so it fits on the labels
    pub short: bool,
    /// Sellers may enter the agreed "not found", e.g. for a worn frame number
    pub not_found_button: bool,
}

impl CategoryField {
    pub fn max_length(&self) -> usize {
        if self.short {
            MAX_SHORT_LENGTH
        } else {
            MAX_VALUE_LENGTH
        }
    }

    /// The label in English if there is one; mails to English speakers use it.
    pub fn label_in(&self, english: bool) -> &str {
        match &self.label_en {
            Some(en) if english && !en.is_empty() => en,
            _ => &self.label,
        }
    }
}

/// A field of a new instance: (id, key, label, label_en, placeholder, placeholder_en, hint,
/// hint_en, short, not_found_button). Same as migration 0034.
type DefaultField = (
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    Option<&'static str>,
    Option<&'static str>,
    Option<&'static str>,
    Option<&'static str>,
    bool,
    bool,
);

pub const DEFAULT_FIELDS: [DefaultField; 9] = [
    (
        "frameNumber",
        "frameNumber",
        "Rahmennummer",
        "Frame number",
        Some("z. B. WBK123456"),
        Some("e.g. WBK123456"),
        Some("Nicht gefunden? Schreib „nicht gefunden“ hinein – wir suchen sie vor Ort gemeinsam."),
        Some("Can't find it? Enter “not found” – we'll look for it together on site."),
        false,
        true,
    ),
    (
        "frameSize",
        "frameSize",
        "Rahmengröße",
        "Frame size",
        Some("z. B. 52 cm oder M"),
        Some("e.g. 52 cm or M"),
        None,
        None,
        false,
        false,
    ),
    (
        "wheelSize",
        "wheelSize",
        "Laufradgröße",
        "Wheel size",
        Some("z. B. 28 Zoll"),
        Some("e.g. 28 inch"),
        None,
        None,
        false,
        false,
    ),
    (
        "clothingSize",
        "size",
        "Größe",
        "Size",
        Some("z. B. M oder 128"),
        Some("e.g. M or 128"),
        None,
        None,
        true,
        false,
    ),
    (
        "shoeSize",
        "size",
        "Größe (EU)",
        "Size (EU)",
        Some("z. B. 38"),
        Some("e.g. 38"),
        None,
        None,
        true,
        false,
    ),
    (
        "sportSize",
        "size",
        "Größe / Länge",
        "Size / length",
        Some("z. B. 160 cm"),
        Some("e.g. 160 cm"),
        None,
        None,
        true,
        false,
    ),
    (
        "brand", "brand", "Marke", "Brand", None, None, None, None, false, false,
    ),
    (
        "color",
        "color",
        "Farbe",
        "Color",
        Some("z. B. Rot"),
        Some("e.g. red"),
        None,
        None,
        false,
        false,
    ),
    (
        "model", "model", "Modell", "Model", None, None, None, None, false, false,
    ),
];

/// Adds the default fields that are missing, e.g. after all data was removed; the default
/// categories name them.
pub async fn insert_default_fields(conn: &mut sqlx::PgConnection) -> sqlx::Result<()> {
    for (position, field) in DEFAULT_FIELDS.iter().enumerate() {
        let (id, key, label, label_en, placeholder, placeholder_en, hint, hint_en, short, nf) =
            *field;
        sqlx::query(
            "INSERT INTO category_field_definitions
               (id, key, label, label_en, placeholder, placeholder_en, hint, hint_en, short,
                not_found_button, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(key)
        .bind(label)
        .bind(label_en)
        .bind(placeholder)
        .bind(placeholder_en)
        .bind(hint)
        .bind(hint_en)
        .bind(short)
        .bind(nf)
        .bind(position as i32 + 1)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

pub async fn load_definitions(conn: &mut sqlx::PgConnection) -> sqlx::Result<Vec<CategoryField>> {
    sqlx::query_as(
        "SELECT id, key, label, label_en, placeholder, placeholder_en, hint, hint_en, short,
                not_found_button
         FROM category_field_definitions ORDER BY position, created_at, id",
    )
    .fetch_all(conn)
    .await
}

/// The fields an admin picked, in the order of the definitions; the error code when one
/// is unknown or two share a key (e.g. two sizes).
pub fn checked_selection(
    ids: &[String],
    definitions: &[CategoryField],
) -> Result<Vec<String>, &'static str> {
    let mut keys = HashSet::new();
    let mut chosen = HashSet::new();
    for id in ids {
        let field = definitions
            .iter()
            .find(|field| &field.id == id)
            .ok_or("category.unknownField")?;
        if chosen.insert(field.id.as_str()) && !keys.insert(field.key.as_str()) {
            return Err("category.oneSize");
        }
    }
    Ok(definitions
        .iter()
        .filter(|field| chosen.contains(field.id.as_str()))
        .map(|field| field.id.clone())
        .collect())
}

/// Fields an organizer can make required, one per key.
pub fn requirable_fields(definitions: &[CategoryField]) -> Vec<&CategoryField> {
    let mut seen = HashSet::new();
    definitions
        .iter()
        .filter(|field| seen.insert(field.key.as_str()))
        .collect()
}

/// A category with its parent, for the inheritance of fields.
pub struct CategoryRef {
    pub id: Uuid,
    pub parent: Option<Uuid>,
    /// Picked by an admin; None: those of the main category
    pub fields: Option<Vec<String>>,
}

/// The field ids of a category: its own choice, else its main category's.
pub fn field_ids(category: Uuid, categories: &[CategoryRef]) -> Vec<String> {
    let by_id: HashMap<Uuid, &CategoryRef> = categories.iter().map(|c| (c.id, c)).collect();
    let mut seen = HashSet::new();
    let mut current = by_id.get(&category).copied();
    while let Some(cat) = current {
        if !seen.insert(cat.id) {
            break;
        }
        if let Some(ids) = &cat.fields {
            return ids.clone();
        }
        current = cat.parent.and_then(|parent| by_id.get(&parent).copied());
    }
    Vec::new()
}

/// The fields of a category, in the order of the definitions; a deleted one is left out.
pub fn category_fields(
    category: Uuid,
    categories: &[CategoryRef],
    definitions: &[CategoryField],
) -> Vec<CategoryField> {
    resolve(&field_ids(category, categories), definitions)
}

pub fn resolve(ids: &[String], definitions: &[CategoryField]) -> Vec<CategoryField> {
    definitions
        .iter()
        .filter(|field| ids.contains(&field.id))
        .cloned()
        .collect()
}

/// Categories and field definitions, everything to resolve the fields of a category.
pub struct FieldIndex {
    pub categories: Vec<CategoryRef>,
    pub definitions: Vec<CategoryField>,
}

impl FieldIndex {
    pub async fn load(conn: &mut sqlx::PgConnection) -> sqlx::Result<Self> {
        Ok(Self {
            categories: load_categories(&mut *conn).await?,
            definitions: load_definitions(conn).await?,
        })
    }

    pub fn fields(&self, category: Uuid) -> Vec<CategoryField> {
        category_fields(category, &self.categories, &self.definitions)
    }
}

pub async fn load_categories(conn: &mut sqlx::PgConnection) -> sqlx::Result<Vec<CategoryRef>> {
    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        parent_id: Option<Uuid>,
        fields: Option<Vec<String>>,
    }
    let rows: Vec<Row> = sqlx::query_as("SELECT id, parent_id, fields FROM categories")
        .fetch_all(conn)
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| CategoryRef {
            id: row.id,
            parent: row.parent_id,
            fields: row.fields,
        })
        .collect())
}

/// The first field of the category whose trimmed value is longer than allowed.
pub fn too_long<'a>(
    fields: &'a [CategoryField],
    attributes: Option<&BTreeMap<String, String>>,
) -> Option<&'a CategoryField> {
    let attributes = attributes?;
    fields.iter().find(|field| {
        attributes
            .get(&field.key)
            .is_some_and(|value| value.trim().chars().count() > field.max_length())
    })
}

/// Keeps only the fields of the category, trims values and drops empty ones; None when
/// nothing is left.
pub fn sanitize_attributes(
    fields: &[CategoryField],
    attributes: Option<&BTreeMap<String, String>>,
) -> Option<BTreeMap<String, String>> {
    let attributes = attributes?;
    let result: BTreeMap<String, String> = fields
        .iter()
        .filter_map(|field| {
            let value = attributes.get(&field.key)?.trim();
            (!value.is_empty()).then(|| {
                (
                    field.key.clone(),
                    value.chars().take(field.max_length()).collect(),
                )
            })
        })
        .collect();
    (!result.is_empty()).then_some(result)
}

#[skip_serializing_none]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Attribute {
    pub label: String,
    pub label_en: Option<String>,
    /// The id of the field
    pub text: String,
    pub value: String,
}

/// Label/value pairs for display, in the order the category defines.
pub fn describe_attributes(
    fields: &[CategoryField],
    attributes: Option<&serde_json::Value>,
) -> Vec<Attribute> {
    let Some(attributes) = attributes.and_then(|a| a.as_object()) else {
        return Vec::new();
    };
    fields
        .iter()
        .filter_map(|field| {
            let value = attributes
                .get(&field.key)?
                .as_str()
                .filter(|v| !v.is_empty())?;
            Some(Attribute {
                label: field.label.clone(),
                label_en: field.label_en.clone(),
                text: field.id.clone(),
                value: value.to_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(id: &str, key: &str, short: bool) -> CategoryField {
        CategoryField {
            id: id.into(),
            key: key.into(),
            label: id.into(),
            label_en: None,
            placeholder: None,
            placeholder_en: None,
            hint: None,
            hint_en: None,
            short,
            not_found_button: false,
        }
    }

    fn definitions() -> Vec<CategoryField> {
        vec![
            definition("frameNumber", "frameNumber", false),
            definition("brand", "brand", false),
            definition("clothingSize", "size", true),
            definition("shoeSize", "size", true),
        ]
    }

    #[test]
    fn admins_pick_fields_one_size_at_most() {
        let pick = |ids: &[&str]| {
            let ids: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
            checked_selection(&ids, &definitions())
        };
        assert_eq!(
            pick(&["brand", "frameNumber", "brand"]),
            Ok(vec!["frameNumber".into(), "brand".into()])
        );
        assert_eq!(pick(&["clothingSize", "shoeSize"]), Err("category.oneSize"));
        assert_eq!(pick(&["height"]), Err("category.unknownField"));
        let definitions = definitions();
        let keys: Vec<_> = requirable_fields(&definitions)
            .iter()
            .map(|f| f.key.as_str())
            .collect();
        assert_eq!(keys, ["frameNumber", "brand", "size"]);
    }

    #[test]
    fn sub_categories_without_a_choice_take_the_main_categorys() {
        let (bikes, kids, trailers, gone) = (
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
        );
        let categories = vec![
            CategoryRef {
                id: bikes,
                parent: None,
                fields: Some(vec!["frameNumber".into(), "brand".into(), "deleted".into()]),
            },
            CategoryRef {
                id: kids,
                parent: Some(bikes),
                fields: None,
            },
            CategoryRef {
                id: trailers,
                parent: Some(bikes),
                fields: Some(vec![]),
            },
        ];
        let keys = |id| -> Vec<String> {
            category_fields(id, &categories, &definitions())
                .into_iter()
                .map(|f| f.key)
                .collect()
        };
        // A deleted definition is left out
        assert_eq!(keys(bikes), ["frameNumber", "brand"]);
        assert_eq!(keys(kids), ["frameNumber", "brand"]);
        assert!(keys(trailers).is_empty());
        assert!(keys(gone).is_empty());
    }

    #[test]
    fn short_fields_fit_on_the_labels() {
        let fields = vec![
            definition("clothingSize", "size", true),
            definition("brand", "brand", false),
        ];
        let values = |size: &str| BTreeMap::from([("size".to_owned(), size.to_owned())]);
        assert!(too_long(&fields, Some(&values(" 134/140 "))).is_none());
        assert_eq!(
            too_long(&fields, Some(&values("134/140/146"))).map(|f| f.key.as_str()),
            Some("size")
        );
        let brand = BTreeMap::from([("brand".to_owned(), "x".repeat(100))]);
        assert!(too_long(&fields, Some(&brand)).is_none());
        let long = BTreeMap::from([
            ("brand".to_owned(), format!(" {} ", "y".repeat(200))),
            ("other".to_owned(), "z".to_owned()),
        ]);
        let kept = sanitize_attributes(&fields, Some(&long)).unwrap();
        assert_eq!(kept["brand"].len(), MAX_VALUE_LENGTH);
        assert!(!kept.contains_key("other"));
    }
}
