//! Feature flags switched by admins in the admin area (#256).

use crate::common;

use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn setup(db: &PgPool) -> (TestApp, String, String) {
    disable_starter_products(db).await;
    let app = TestApp::new(db.clone());
    let admin = app.user_session("admin@example.org", true).await;
    let user = app.user_session("user@example.org", false).await;
    (app, admin, user)
}

async fn admin_flag(app: &TestApp, admin: &str, key: &str) -> Value {
    let reply = app
        .query("featureFlags.listForAdmin", json!({}), Some(admin))
        .await;
    reply.body["value"]
        .as_array()
        .unwrap()
        .iter()
        .find(|flag| flag["key"] == key)
        .cloned()
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admins_list_the_flags_with_defaults(db: PgPool) {
    let (app, admin, user) = setup(&db).await;
    let forbidden = app
        .query("featureFlags.listForAdmin", json!({}), Some(&user))
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");

    let flags = app
        .query("featureFlags.listForAdmin", json!({}), Some(&admin))
        .await
        .body["value"]
        .clone();
    let keys: Vec<&str> = flags
        .as_array()
        .unwrap()
        .iter()
        .map(|flag| flag["key"].as_str().unwrap())
        .collect();
    assert!(keys.contains(&"is_registration_enabled"));
    // The flag of the E2E tests stores sign-in codes: never in the admin area
    assert!(!keys.contains(&"is_e2e_auth_skip_email"));

    let registration = admin_flag(&app, &admin, "is_registration_enabled").await;
    assert_eq!(registration["value"], true);
    assert_eq!(registration["isDefault"], true);
    // Set by disable_starter_products, but by no admin
    let starter = admin_flag(&app, &admin, "is_create_products_on_signup_enabled").await;
    assert_eq!(starter["value"], false);
    assert_eq!(starter["isDefault"], false);
    assert_eq!(starter["updatedBy"], Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admins_switch_known_flags_only(db: PgPool) {
    let (app, admin, user) = setup(&db).await;
    let forbidden = app
        .mutation(
            "featureFlags.update",
            json!({ "key": "is_registration_enabled", "value": false }),
            Some(&user),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
    let unknown = app
        .mutation(
            "featureFlags.update",
            json!({ "key": "is_e2e_auth_skip_email", "value": true }),
            Some(&admin),
        )
        .await;
    assert_eq!(unknown.body["code"], "featureFlags.unknown");

    let switched = app
        .mutation(
            "featureFlags.update",
            json!({ "key": "is_registration_enabled", "value": false }),
            Some(&admin),
        )
        .await;
    assert_eq!(switched.status, 200, "{:?}", switched.body);
    let flag = admin_flag(&app, &admin, "is_registration_enabled").await;
    assert_eq!(flag["value"], false);
    assert_eq!(flag["isDefault"], false);
    assert!(flag["updatedAt"].is_number());
    assert!(flag["updatedBy"].is_string());
    // The public query sees it at once
    let public = app.query("featureFlags.get", json!({}), None).await;
    assert_eq!(public.body["value"]["is_registration_enabled"], false);
}
