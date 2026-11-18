//! Extra item fields per category, e.g. frame number for bikes.
//! Admins pick them from a fixed list per category; otherwise they follow the name, matched
//! by keywords, since category names are free text.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use uuid::Uuid;

const MAX_VALUE_LENGTH: usize = 120;
/// Longest size, e.g. "134/140" or "160 cm"; longer ones would not fit on the labels.
/// Same as MAX_SIZE_LENGTH in src/shared/categoryFields.ts.
pub const MAX_SIZE_LENGTH: usize = 7;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CategoryField {
    pub key: &'static str,
    /// Translation of label, placeholder and hint: categoryFields.<text> in src/locales
    pub text: &'static str,
    pub label: &'static str,
    #[serde(skip)]
    pub max_length: usize,
}

const fn field(key: &'static str, text: &'static str, label: &'static str) -> CategoryField {
    CategoryField {
        key,
        text,
        label,
        max_length: MAX_VALUE_LENGTH,
    }
}

const fn size(text: &'static str, label: &'static str) -> CategoryField {
    CategoryField {
        max_length: MAX_SIZE_LENGTH,
        ..field("size", text, label)
    }
}

const BIKE: &[CategoryField] = &[
    field("frameNumber", "frameNumber", "Rahmennummer"),
    field("frameSize", "frameSize", "Rahmengröße"),
    field("wheelSize", "wheelSize", "Laufradgröße"),
    field("brand", "bikeBrand", "Marke"),
    field("color", "color", "Farbe"),
];
const CLOTHING: &[CategoryField] = &[
    size("clothingSize", "Größe"),
    field("brand", "brand", "Marke"),
    field("color", "color", "Farbe"),
];
const SHOES: &[CategoryField] = &[
    size("shoeSize", "Größe (EU)"),
    field("brand", "brand", "Marke"),
];
const SPORT: &[CategoryField] = &[
    size("sportSize", "Größe / Länge"),
    field("brand", "brand", "Marke"),
    field("color", "color", "Farbe"),
];
const ELECTRONICS: &[CategoryField] = &[
    field("brand", "brand", "Marke"),
    field("model", "model", "Modell"),
];

/// The fields an admin can pick for a category, by `text`; one size at most, since all
/// sizes share the key. Same list as SELECTABLE_FIELDS in src/shared/categoryFields.ts.
pub const SELECTABLE: &[CategoryField] = &[
    field("frameNumber", "frameNumber", "Rahmennummer"),
    field("frameSize", "frameSize", "Rahmengröße"),
    field("wheelSize", "wheelSize", "Laufradgröße"),
    field("brand", "brand", "Marke"),
    field("color", "color", "Farbe"),
    size("clothingSize", "Größe"),
    size("shoeSize", "Größe (EU)"),
    size("sportSize", "Größe / Länge"),
    field("model", "model", "Modell"),
];

fn selectable(id: &str) -> Option<CategoryField> {
    SELECTABLE.iter().find(|field| field.text == id).copied()
}

/// The fields an admin picked, in the order of the list; the error code when one is
/// unknown or two share a key (two sizes).
pub fn checked_selection(ids: &[String]) -> Result<Vec<String>, &'static str> {
    let mut keys = HashSet::new();
    let mut chosen = HashSet::new();
    for id in ids {
        let field = selectable(id).ok_or("category.unknownField")?;
        if chosen.insert(field.text) && !keys.insert(field.key) {
            return Err("category.oneSize");
        }
    }
    Ok(SELECTABLE
        .iter()
        .filter(|field| chosen.contains(field.text))
        .map(|field| field.text.to_owned())
        .collect())
}

struct Rule {
    matches: Regex,
    exclude: Option<Regex>,
    fields: &'static [CategoryField],
}

/// The first matching rule wins. `\b` is ASCII-only, as in JavaScript.
static RULES: LazyLock<Vec<Rule>> = LazyLock::new(|| {
    let re = |pattern: &str| {
        Regex::new(&format!("(?i){}", pattern.replace(r"\b", r"(?-u:\b)"))).unwrap()
    };
    vec![
        Rule {
            // "rad" only as a whole word or word ending, so "Radio" does not count as a bike
            matches: re(r"fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx"),
            // No frame number: accessories, cycling clothes, trailers, child seats, unicycles
            exclude: Some(re(
                r"zubehör|teile|bekleidung|helm|anhänger|schloss|sitz|einr[aä]d",
            )),
            fields: BIKE,
        },
        Rule {
            matches: re(r"schuh|stiefel|sneaker"),
            exclude: None,
            fields: SHOES,
        },
        // "mode" only as a word or word ending ("Damenmode"), not in "Sondermodelle"
        Rule {
            matches: re(r"kleid|jacke|hose|\bmode\b|mode$|shirt|pullover"),
            exclude: None,
            fields: CLOTHING,
        },
        Rule {
            matches: re(r"sport|\bski|snowboard"),
            exclude: None,
            fields: SPORT,
        },
        Rule {
            matches: re(r"elektron|handy|smartphone|computer|laptop|tablet|kamera|konsole"),
            exclude: None,
            fields: ELECTRONICS,
        },
    ]
});

/// Fields an organizer can make required, one per key.
pub fn requirable_fields() -> Vec<CategoryField> {
    let mut seen = HashSet::new();
    SELECTABLE
        .iter()
        .copied()
        .filter(|field| seen.insert(field.key))
        .collect()
}

/// The fields of a label, None when no rule speaks about it. A label a rule excludes on
/// purpose ("Fahrradanhänger") has no fields: as a sub-category of "Fahrräder" it must not
/// inherit the frame number.
pub fn fields_for_label(label: &str) -> Option<&'static [CategoryField]> {
    let name = label.trim();
    let mut excluded = false;
    for rule in RULES.iter().filter(|rule| rule.matches.is_match(name)) {
        if rule.exclude.as_ref().is_some_and(|ex| ex.is_match(name)) {
            excluded = true;
        } else {
            return Some(rule.fields);
        }
    }
    excluded.then_some(&[])
}

/// A category with its parent, for the inheritance of fields.
pub struct CategoryRef {
    pub id: Uuid,
    pub label: String,
    pub parent: Option<Uuid>,
    /// Picked by an admin; None: by the name
    pub fields: Option<Vec<String>>,
}

/// Fields of a category: the ones an admin picked, else those of its name; sub-categories
/// without either inherit the parent's.
pub fn category_fields(category: Uuid, categories: &[CategoryRef]) -> Vec<CategoryField> {
    let by_id: HashMap<Uuid, &CategoryRef> = categories.iter().map(|c| (c.id, c)).collect();
    let mut seen = HashSet::new();
    let mut current = by_id.get(&category).copied();
    while let Some(cat) = current {
        if !seen.insert(cat.id) {
            break;
        }
        if let Some(ids) = &cat.fields {
            return ids.iter().filter_map(|id| selectable(id)).collect();
        }
        if let Some(fields) = fields_for_label(&cat.label) {
            return fields.to_vec();
        }
        current = cat.parent.and_then(|parent| by_id.get(&parent).copied());
    }
    Vec::new()
}

pub async fn load_categories(conn: &mut sqlx::PgConnection) -> sqlx::Result<Vec<CategoryRef>> {
    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        label: String,
        parent_id: Option<Uuid>,
        fields: Option<Vec<String>>,
    }
    let rows: Vec<Row> = sqlx::query_as("SELECT id, label, parent_id, fields FROM categories")
        .fetch_all(conn)
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| CategoryRef {
            id: row.id,
            label: row.label,
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
            .get(field.key)
            .is_some_and(|value| value.trim().chars().count() > field.max_length)
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
            let value = attributes.get(field.key)?.trim();
            (!value.is_empty()).then(|| {
                (
                    field.key.to_owned(),
                    value.chars().take(field.max_length).collect(),
                )
            })
        })
        .collect();
    (!result.is_empty()).then_some(result)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Attribute {
    pub label: &'static str,
    pub text: &'static str,
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
                .get(field.key)?
                .as_str()
                .filter(|v| !v.is_empty())?;
            Some(Attribute {
                label: field.label,
                text: field.text,
                value: value.to_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(label: &str) -> Vec<&'static str> {
        fields_for_label(label)
            .unwrap_or(&[])
            .iter()
            .map(|f| f.key)
            .collect()
    }

    #[test]
    fn categories_are_matched_by_keywords() {
        assert_eq!(
            keys("Fahrräder"),
            ["frameNumber", "frameSize", "wheelSize", "brand", "color"]
        );
        assert_eq!(keys("Kinderrad"), keys("Fahrräder"));
        assert_eq!(keys("E-Bikes / Pedelecs"), keys("Fahrräder"));
        assert!(keys("Radio").is_empty());
        assert!(keys("Fahrradzubehör").is_empty());
        assert_eq!(keys("Damenmode"), ["size", "brand", "color"]);
        assert!(keys("Sondermodelle").is_empty());
        assert_eq!(keys("Skischuhe"), ["size", "brand"]);
        assert_eq!(keys("Sport"), ["size", "brand", "color"]);
        assert_eq!(keys("Laptops"), ["brand", "model"]);
    }

    /// The default categories for bikes and children's vehicles (#300)
    #[test]
    fn bike_categories_have_a_frame_number_only_when_ridden_with_one() {
        let bike = keys("Fahrräder");
        for label in [
            "Kinderfahrräder",
            "Kinderrad",
            "Laufräder",
            "Laufrad",
            "Lastenräder",
            "E-Bikes & Pedelecs",
        ] {
            assert_eq!(keys(label), bike, "{label}");
        }
        for label in [
            "Roller & Scooter",
            "Einräder",
            "Einrad",
            "Bobbycars & Rutschfahrzeuge",
            "Fahrradanhänger",
            "Fahrrad-Kindersitze",
            "Fahrradzubehör",
        ] {
            assert!(keys(label).is_empty(), "{label}");
        }
    }

    /// With the inheritance from the main category, as the default tree is seeded
    #[test]
    fn every_default_category_is_matched_on_purpose() {
        let defaults = &crate::modules::categories::DEFAULT_CATEGORIES;
        let id = |label: &str| {
            let index = defaults.iter().position(|c| c.label == label).unwrap();
            Uuid::from_u128(index as u128 + 1)
        };
        let tree: Vec<CategoryRef> = defaults
            .iter()
            .map(|c| CategoryRef {
                id: id(c.label),
                label: c.label.into(),
                parent: c.parent.map(id),
                fields: None,
            })
            .collect();
        for category in defaults {
            let fields = category_fields(id(category.label), &tree);
            let has_frame_number = fields.iter().any(|f| f.key == "frameNumber");
            let bike = matches!(
                category.label,
                "Fahrräder"
                    | "Kinderfahrräder"
                    | "Laufräder"
                    | "Lastenräder"
                    | "E-Bikes & Pedelecs"
            );
            assert_eq!(has_frame_number, bike, "{}", category.label);
            // One level: a main category is listed before its sub-categories
            if let Some(parent) = category.parent {
                let main = defaults.iter().position(|c| c.label == parent).unwrap();
                assert!(defaults[main].parent.is_none(), "{parent}");
                assert!(
                    main < defaults
                        .iter()
                        .position(|c| c.label == category.label)
                        .unwrap()
                );
            }
        }
    }

    #[test]
    fn sizes_are_short() {
        let fields = fields_for_label("Damenmode").unwrap();
        let values = |size: &str| BTreeMap::from([("size".to_owned(), size.to_owned())]);
        assert!(too_long(fields, Some(&values(" 134/140 "))).is_none());
        assert_eq!(
            too_long(fields, Some(&values("134/140/146"))).map(|f| f.key),
            Some("size")
        );
        let brand = BTreeMap::from([("brand".to_owned(), "x".repeat(100))]);
        assert!(too_long(fields, Some(&brand)).is_none());
    }

    #[test]
    fn sub_categories_inherit_the_fields() {
        let bikes = Uuid::new_v4();
        let kids = Uuid::new_v4();
        let categories = vec![
            CategoryRef {
                id: bikes,
                label: "Fahrräder".into(),
                parent: None,
                fields: None,
            },
            CategoryRef {
                id: kids,
                label: "Für Kinder".into(),
                parent: Some(bikes),
                fields: None,
            },
        ];
        assert_eq!(category_fields(kids, &categories).len(), 5);
    }

    #[test]
    fn excluded_sub_categories_do_not_inherit_the_frame_number() {
        let bikes = Uuid::new_v4();
        let trailers = Uuid::new_v4();
        let clothes = Uuid::new_v4();
        let categories = vec![
            CategoryRef {
                id: bikes,
                label: "Fahrräder".into(),
                parent: None,
                fields: None,
            },
            CategoryRef {
                id: trailers,
                label: "Fahrradanhänger".into(),
                parent: Some(bikes),
                fields: None,
            },
            CategoryRef {
                id: clothes,
                label: "Fahrradbekleidung".into(),
                parent: Some(bikes),
                fields: None,
            },
        ];
        assert!(category_fields(trailers, &categories).is_empty());
        let keys: Vec<_> = category_fields(clothes, &categories)
            .iter()
            .map(|f| f.key)
            .collect();
        assert_eq!(keys, ["size", "brand", "color"]);
    }

    #[test]
    fn admins_pick_fields_that_override_the_name() {
        let pick = |ids: &[&str]| {
            checked_selection(&ids.iter().map(|id| id.to_string()).collect::<Vec<_>>())
        };
        assert_eq!(
            pick(&["model", "brand", "brand"]),
            Ok(vec!["brand".into(), "model".into()])
        );
        assert_eq!(pick(&["shoeSize", "sportSize"]), Err("category.oneSize"));
        assert_eq!(pick(&["bikeBrand"]), Err("category.unknownField"));
        // Every field a name can bring can be picked as well, by its key
        for rule in RULES.iter() {
            for field in rule.fields {
                assert!(
                    SELECTABLE.iter().any(|s| s.key == field.key),
                    "{}",
                    field.key
                );
            }
        }

        let (bikes, trailers, kids) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let categories = vec![
            CategoryRef {
                id: bikes,
                label: "Räder".into(),
                parent: None,
                fields: Some(vec!["frameNumber".into(), "color".into()]),
            },
            CategoryRef {
                id: trailers,
                label: "Fahrradanhänger".into(),
                parent: Some(bikes),
                fields: Some(vec!["brand".into()]),
            },
            CategoryRef {
                id: kids,
                label: "Für Kinder".into(),
                parent: Some(bikes),
                fields: None,
            },
        ];
        let keys = |id| -> Vec<_> {
            category_fields(id, &categories)
                .iter()
                .map(|f| f.key)
                .collect()
        };
        assert_eq!(keys(bikes), ["frameNumber", "color"]);
        assert_eq!(keys(trailers), ["brand"]);
        assert_eq!(keys(kids), ["frameNumber", "color"]);
    }

    #[test]
    fn requirable_fields_are_unique_by_key() {
        let keys: Vec<_> = requirable_fields().iter().map(|f| f.key).collect();
        assert_eq!(
            keys,
            [
                "frameNumber",
                "frameSize",
                "wheelSize",
                "brand",
                "color",
                "size",
                "model"
            ]
        );
    }
}
