//! Feature flags.

use sqlx::PgConnection;

pub const LOGIN_ENABLED: &str = "is_login_enabled";
pub const REGISTRATION_ENABLED: &str = "is_registration_enabled";
pub const CREATE_PRODUCTS_ON_SIGNUP: &str = "is_create_products_on_signup_enabled";
pub const EVENT_CREATION_ENABLED: &str = "is_event_creation_enabled";
pub const UNDO_INVENTORY_ACTIONS: &str = "allow_undo_inventory_actions";
pub const DEMO_MODE: &str = "is_demo_mode";
/// E2E tests: sign-in codes go to e2e_auth_tokens instead of an email
pub const E2E_AUTH_SKIP_EMAIL: &str = "is_e2e_auth_skip_email";

/// The flags admins switch in the admin area, with the value they have while unset.
/// E2E_AUTH_SKIP_EMAIL is not among them: it stores sign-in codes for tests.
pub const ADMIN_FLAGS: [(&str, bool); 6] = [
    (LOGIN_ENABLED, true),
    (REGISTRATION_ENABLED, true),
    (EVENT_CREATION_ENABLED, true),
    (CREATE_PRODUCTS_ON_SIGNUP, true),
    (UNDO_INVENTORY_ACTIONS, false),
    (DEMO_MODE, false),
];

/// The flag's value, `default` if it was never set.
pub async fn get(conn: &mut PgConnection, key: &str, default: bool) -> sqlx::Result<bool> {
    let value: Option<bool> = sqlx::query_scalar("SELECT value FROM feature_flags WHERE key = $1")
        .bind(key)
        .fetch_optional(conn)
        .await?;
    Ok(value.unwrap_or(default))
}

pub async fn set(conn: &mut PgConnection, key: &str, value: bool) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(key)
    .bind(value)
    .execute(conn)
    .await?;
    Ok(())
}
