//! Services of a bazaar kept by admins (#256).

use crate::common;

use axum::http::StatusCode;
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const HOUR: f64 = 3_600_000.0;

async fn setup(db: &PgPool) -> (TestApp, String, String) {
    disable_starter_products(db).await;
    let app = TestApp::new(db.clone());
    let admin = app.user_session("admin@example.org", true).await;
    let user = app.user_session("orga@example.org", false).await;
    (app, admin, user)
}

async fn create_event(app: &TestApp, session: &str, services: Value) -> Uuid {
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let reply = app
        .mutation(
            "events.createEvent",
            json!({
                "title": "Kinderbasar",
                "description": "Kinderkleider",
                "location": "Halle",
                "startDate": now + 24.0 * HOUR,
                "endDate": now + 30.0 * HOUR,
                "contactInfo": "orga@test.de",
                "categories": [],
                "services": services,
                "visibility": "logged-in",
                "commission": 10,
            }),
            Some(session),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"].as_str().unwrap().parse().unwrap()
}

async fn names(app: &TestApp) -> Vec<String> {
    app.query("services.list", json!({}), None).await.body["value"]
        .as_array()
        .unwrap()
        .iter()
        .map(|service| service["name"].as_str().unwrap().to_owned())
        .collect()
}

async fn event_services(app: &TestApp, session: &str, id: Uuid) -> Value {
    app.query("events.getEvent", json!({ "id": id }), Some(session))
        .await
        .body["value"]["services"]
        .clone()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn everybody_sees_the_services_in_order(db: PgPool) {
    let app = TestApp::new(db.clone());
    assert_eq!(
        names(&app).await,
        [
            "Parkplatz",
            "Skiservice",
            "Fahrradcodierung",
            "Gastronomie",
            "Imbiss",
            "Getränke"
        ]
    );
    let list = app.query("services.list", json!({}), None).await.body["value"].clone();
    assert_eq!(list[0], json!({ "name": "Parkplatz", "nameEn": "Parking" }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admins_add_rename_and_move_services(db: PgPool) {
    let (app, admin, user) = setup(&db).await;
    let save = |session: &str, args: Value| {
        let app = &app;
        let session = session.to_owned();
        async move { app.mutation("services.save", args, Some(&session)).await }
    };
    assert_eq!(
        save(&user, json!({ "name": "Hüpfburg" })).await.body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        save(&admin, json!({ "name": " parkplatz " })).await.body["code"],
        "services.duplicate"
    );
    assert_eq!(
        save(&admin, json!({ "name": "  " })).await.body["code"],
        "services.nameLength"
    );

    let added = save(
        &admin,
        json!({ "name": " Hüpfburg ", "nameEn": "Bouncy castle" }),
    )
    .await;
    assert_eq!(added.status, StatusCode::OK, "{}", added.body);
    assert_eq!(names(&app).await.last().unwrap(), "Hüpfburg");

    // Organizers pick it, and keep it when it is renamed
    let event = create_event(&app, &user, json!(["Hüpfburg", "Parkplatz"])).await;
    let renamed = save(
        &admin,
        json!({ "original": "Hüpfburg", "name": "Kinderecke", "nameEn": "" }),
    )
    .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.body);
    assert_eq!(
        event_services(&app, &user, event).await,
        json!(["Kinderecke", "Parkplatz"])
    );
    let list = app.query("services.list", json!({}), None).await.body["value"].clone();
    assert_eq!(list[6], json!({ "name": "Kinderecke" }));

    app.mutation(
        "services.move",
        json!({ "name": "Kinderecke", "up": true }),
        Some(&admin),
    )
    .await;
    assert_eq!(names(&app).await[5..], ["Kinderecke", "Getränke"]);
    // The first one stays first
    app.mutation(
        "services.move",
        json!({ "name": "Parkplatz", "up": true }),
        Some(&admin),
    )
    .await;
    assert_eq!(names(&app).await[0], "Parkplatz");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn services_of_upcoming_bazaars_cannot_be_deleted(db: PgPool) {
    let (app, admin, user) = setup(&db).await;
    let event = create_event(&app, &user, json!(["Imbiss", "Getränke"])).await;

    let admin_list = app
        .query("services.listForAdmin", json!({}), Some(&admin))
        .await
        .body["value"]
        .clone();
    let snacks = admin_list
        .as_array()
        .unwrap()
        .iter()
        .find(|service| service["name"] == "Imbiss")
        .unwrap();
    assert_eq!(
        (snacks["activeEvents"].clone(), snacks["pastEvents"].clone()),
        (json!(1), json!(0))
    );

    let refused = app
        .mutation("services.delete", json!({ "name": "Imbiss" }), Some(&admin))
        .await;
    assert_eq!(refused.body["code"], "services.inUse");
    assert_eq!(refused.body["params"]["count"], "1");

    // Once the bazaar is over, the service goes, and the bazaar loses it
    sqlx::query("UPDATE events SET start_date = now() - interval '2 days', end_date = now() - interval '1 day' WHERE id = $1")
        .bind(event)
        .execute(&db)
        .await
        .unwrap();
    let deleted = app
        .mutation("services.delete", json!({ "name": "Imbiss" }), Some(&admin))
        .await;
    assert_eq!(deleted.status, StatusCode::OK, "{}", deleted.body);
    assert!(!names(&app).await.contains(&"Imbiss".to_owned()));
    assert_eq!(
        event_services(&app, &user, event).await,
        json!(["Getränke"])
    );

    // Organizers cannot pick it any more
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let refused = app
        .mutation(
            "events.createEvent",
            json!({
                "title": "Basar", "description": "x", "location": "Halle",
                "startDate": now + HOUR, "endDate": now + 2.0 * HOUR,
                "contactInfo": "orga@test.de", "categories": [], "services": ["Imbiss"],
                "visibility": "logged-in", "commission": 10,
            }),
            Some(&user),
        )
        .await;
    assert_eq!(refused.body["code"], "INVALID_ARGUMENTS");
}
