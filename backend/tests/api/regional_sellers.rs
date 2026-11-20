//! Sellers without items and sellers from the bazaar's region (#304).

use crate::common;

use axum::http::StatusCode;
use common::fixtures::{self, EventSpec};
use common::{Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Bazaar {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    organizer: String,
}

impl Bazaar {
    async fn new(db: PgPool, features: Value) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                features,
                ..EventSpec::new("Fahrradbörse", organizer)
            },
        )
        .await;
        Self {
            organizer: fixtures::session(&db, organizer).await,
            app,
            db,
            event,
        }
    }

    /// A user with this postal code and country in the profile
    async fn person(&self, name: &str, zip: Option<&str>, country: &str) -> (Uuid, String) {
        let user = fixtures::user(&self.db, name).await;
        sqlx::query("UPDATE users SET zip_code = $2, country = $3 WHERE id = $1")
            .bind(user)
            .bind(zip)
            .bind(country)
            .execute(&self.db)
            .await
            .unwrap();
        (user, fixtures::session(&self.db, user).await)
    }

    async fn join(&self, session: &str, extra: Value) -> Reply {
        let mut args = json!({ "eventId": self.event });
        for (key, value) in extra.as_object().unwrap() {
            args[key] = value.clone();
        }
        self.app
            .mutation("eventSeller.joinEvent", args, Some(session))
            .await
    }

    async fn seller(&self, name: &str) -> (Uuid, String) {
        let (user, session) = self.person(name, Some("89073"), "DE").await;
        let joined = self.join(&session, json!({})).await;
        assert_eq!(joined.status, StatusCode::OK, "{}", joined.body);
        (user, session)
    }

    async fn announce(&self, seller: Uuid, session: &str) -> Reply {
        let product = fixtures::product(&self.db, seller, "Rad", 50.0).await;
        self.announce_product(product, session).await
    }

    async fn announce_product(&self, product: Uuid, session: &str) -> Reply {
        self.app
            .mutation(
                "eventProducts.addProductToEvent",
                json!({ "eventId": self.event, "productId": product }),
                Some(session),
            )
            .await
    }

    async fn unregister(&self, session: &str, message: Option<&str>) -> Reply {
        self.app
            .mutation(
                "eventSeller.removeSellersWithoutItems",
                json!({ "eventId": self.event, "message": message }),
                Some(session),
            )
            .await
    }

    async fn edit(&self, features: Value) -> Reply {
        let mut args = crate::events::edit_args(&self.app, &self.organizer, self.event).await;
        args["features"] = features;
        self.app
            .mutation("events.editEvent", args, Some(&self.organizer))
            .await
    }

    async fn is_seller(&self, user: Uuid) -> bool {
        sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM event_roles WHERE event_id = $1 AND user_id = $2 AND role = 'seller')",
        )
        .bind(self.event)
        .bind(user)
        .fetch_one(&self.db)
        .await
        .unwrap()
    }

    async fn preview(&self) -> i64 {
        let reply = self
            .app
            .query(
                "broadcasts.getBroadcastPreview",
                json!({ "eventId": self.event, "audience": "withoutItems" }),
                Some(&self.organizer),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
        reply.body["value"]["recipients"].as_i64().unwrap()
    }

    async fn without_items_in_list(&self) -> Vec<Uuid> {
        let reply = self
            .app
            .query(
                "eventRoles.getVendorsForEvent",
                json!({ "eventId": self.event }),
                Some(&self.organizer),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
        reply.body["value"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|vendor| vendor["withoutItems"] == json!(true))
            .map(|vendor| serde_json::from_value(vendor["_id"].clone()).unwrap())
            .collect()
    }
}

fn region() -> Value {
    json!({ "allowedPostalCodes": ["89", "7322"], "postalCodeCountry": "DE", "photosOptional": true })
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_sellers_from_the_region_join(db: PgPool) {
    let b = Bazaar::new(db, region()).await;
    let (_, ulm) = b.person("Ulm", Some("89073"), "DE").await;
    assert_eq!(b.join(&ulm, json!({})).await.status, StatusCode::OK);
    let (_, aalen) = b.person("Aalen", Some("73223"), "Deutschland").await;
    assert_eq!(b.join(&aalen, json!({})).await.status, StatusCode::OK);

    let (_, biberach) = b.person("Biberach", Some("88400"), "DE").await;
    let refused = b.join(&biberach, json!({})).await;
    assert_eq!(refused.status, StatusCode::BAD_REQUEST);
    assert_eq!(refused.body["code"], "join.postalCode");
    assert!(
        refused.body["message"]
            .as_str()
            .unwrap()
            .contains("89…, 7322… (DE)"),
        "{}",
        refused.body
    );
    // The same digits in another country are another place
    let (_, graz) = b.person("Graz", Some("8900"), "AT").await;
    assert_eq!(
        b.join(&graz, json!({})).await.body["code"],
        "join.postalCode"
    );
    let (_, unknown) = b.person("Ohne", None, "DE").await;
    assert_eq!(
        b.join(&unknown, json!({})).await.body["code"],
        "join.postalCodeMissing"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn invitations_codes_and_the_team_pass_the_region(db: PgPool) {
    let b = Bazaar::new(db, region()).await;
    // An invitation by mail is the organizer's exception
    let (guest, guest_session) = b.person("Gast", Some("10115"), "DE").await;
    let sent = b
        .app
        .mutation(
            "eventInvitations.send",
            json!({ "eventId": b.event, "email": "gast@test.example", "helper": false }),
            Some(&b.organizer),
        )
        .await;
    assert_eq!(sent.status, StatusCode::OK, "{}", sent.body);
    b.app.run_jobs().await;
    let token = {
        let sent = b.app.sent.lock().unwrap();
        let html = &sent.last().unwrap().html;
        let start = html.find("/invite/").unwrap() + 8;
        html[start..start + html[start..].find('"').unwrap()].to_owned()
    };
    let joined = b.join(&guest_session, json!({ "invitation": token })).await;
    assert_eq!(joined.status, StatusCode::OK, "{}", joined.body);
    assert!(b.is_seller(guest).await);

    // A helper sells whenever they like
    let (helper, helper_session) = b.person("Helfer", Some("10115"), "DE").await;
    fixtures::role(&b.db, b.event, helper, "coorganizer").await;
    assert_eq!(
        b.join(&helper_session, json!({})).await.status,
        StatusCode::OK
    );

    // Who has the access code got it from the organizer
    sqlx::query("UPDATE events SET access_code = 'RAD' WHERE id = $1")
        .bind(b.event)
        .execute(&b.db)
        .await
        .unwrap();
    let (_, berlin) = b.person("Berlin", Some("10117"), "DE").await;
    let joined = b.join(&berlin, json!({ "accessCode": "RAD" })).await;
    assert_eq!(joined.status, StatusCode::OK, "{}", joined.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_region_is_saved_short_and_checked(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let edit = |features: Value| b.edit(features);
    let saved = edit(
        json!({ "allowedPostalCodes": ["890", " 89 ", "7322", "73"], "postalCodeCountry": "DE" }),
    )
    .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.body);
    let features: Value = sqlx::query_scalar("SELECT features FROM events WHERE id = $1")
        .bind(b.event)
        .fetch_one(&b.db)
        .await
        .unwrap();
    assert_eq!(features["allowedPostalCodes"], json!(["73", "89"]));
    assert_eq!(features["postalCodeCountry"], "DE");

    // Other settings leave it alone, an empty list takes it away
    assert_eq!(
        edit(json!({ "discounts": false })).await.status,
        StatusCode::OK
    );
    let features: Value = sqlx::query_scalar("SELECT features FROM events WHERE id = $1")
        .bind(b.event)
        .fetch_one(&b.db)
        .await
        .unwrap();
    assert_eq!(features["allowedPostalCodes"], json!(["73", "89"]));

    let wrong = edit(json!({ "allowedPostalCodes": ["89a"] })).await;
    assert_eq!(wrong.body["code"], "event.postalCodeInvalid");
    let wrong = edit(json!({ "allowedPostalCodes": ["89"], "postalCodeCountry": "FR" })).await;
    assert_eq!(wrong.status, StatusCode::BAD_REQUEST);

    assert_eq!(
        edit(json!({ "allowedPostalCodes": [] })).await.status,
        StatusCode::OK
    );
    let features: Value = sqlx::query_scalar("SELECT features FROM events WHERE id = $1")
        .bind(b.event)
        .fetch_one(&b.db)
        .await
        .unwrap();
    assert!(features.get("allowedPostalCodes").is_none(), "{features}");
    assert!(features.get("postalCodeCountry").is_none(), "{features}");
}

/// Anna announced an item, Ben did not, Cleo had one rejected; plus a helper, a walk-in
/// seller and an excluded seller without items.
async fn crowd(b: &Bazaar) -> (Uuid, Uuid, Uuid, Uuid) {
    let (anna, anna_session) = b.seller("Anna").await;
    let announced = b.announce(anna, &anna_session).await;
    assert_eq!(announced.status, StatusCode::OK, "{}", announced.body);
    let (ben, _) = b.seller("Ben").await;
    let (cleo, _) = b.seller("Cleo").await;
    let rejected = fixtures::product(&b.db, cleo, "Kaputt", 5.0).await;
    fixtures::event_product(&b.db, b.event, rejected, "rejected").await;
    let (helper, _) = b.seller("Helfer").await;
    fixtures::role(&b.db, b.event, helper, "coorganizer").await;
    let walk_in: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, managed_by_event_id, status) VALUES ('Vor Ort', $1, 'active') RETURNING id",
    )
    .bind(b.event)
    .fetch_one(&b.db)
    .await
    .unwrap();
    fixtures::role(&b.db, b.event, walk_in, "seller").await;
    let (excluded, _) = b.seller("Ausgeschlossen").await;
    let reply = b
        .app
        .mutation(
            "eventExclusions.exclude",
            json!({ "eventId": b.event, "userId": excluded }),
            Some(&b.organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    (anna, ben, cleo, helper)
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sellers_without_items_get_their_own_message(db: PgPool) {
    let b = Bazaar::new(db, json!({ "photosOptional": true })).await;
    let (_, ben, cleo, _) = crowd(&b).await;
    assert_eq!(b.preview().await, 2);
    let mut listed = b.without_items_in_list().await;
    listed.sort();
    let mut expected = vec![ben, cleo];
    expected.sort();
    assert_eq!(listed, expected);

    let sent = b
        .app
        .mutation(
            "broadcasts.sendSellerBroadcast",
            json!({
                "eventId": b.event,
                "subject": "Artikel anmelden",
                "body": "Bitte meldet bis Freitag eure Artikel an.",
                "audience": "withoutItems",
                "important": false,
            }),
            Some(&b.organizer),
        )
        .await;
    assert_eq!(sent.status, StatusCode::OK, "{}", sent.body);
    assert_eq!(sent.body["value"], 2);
    let audience: String =
        sqlx::query_scalar("SELECT audience::text FROM event_broadcasts WHERE event_id = $1")
            .bind(b.event)
            .fetch_one(&b.db)
            .await
            .unwrap();
    assert_eq!(audience, "withoutItems");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_unregisters_all_sellers_without_items(db: PgPool) {
    let b = Bazaar::new(db, json!({ "photosOptional": true })).await;
    let (anna, ben, cleo, helper) = crowd(&b).await;
    // Full: Anna, Ben and Cleo take the places, the team and the excluded take none
    sqlx::query("UPDATE events SET vendor_limit = 3 WHERE id = $1")
        .bind(b.event)
        .execute(&b.db)
        .await
        .unwrap();
    let (_, late) = b.person("Spät", Some("89073"), "DE").await;
    assert_eq!(
        b.join(&late, json!({})).await.body["code"],
        "join.vendorLimit"
    );

    // Helpers take items in, but whom the bazaar has as sellers is the organizer's choice
    let helper_session = fixtures::session(&b.db, helper).await;
    assert_eq!(
        b.unregister(&helper_session, None).await.status,
        StatusCode::FORBIDDEN
    );

    let reply = b
        .unregister(&b.organizer, Some("Die Plätze sind knapp."))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"], 2);
    assert!(b.is_seller(anna).await && b.is_seller(helper).await);
    assert!(!b.is_seller(ben).await && !b.is_seller(cleo).await);
    let rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM event_sellers WHERE event_id = $1 AND user_id = ANY($2)",
    )
    .bind(b.event)
    .bind(vec![ben, cleo])
    .fetch_one(&b.db)
    .await
    .unwrap();
    assert_eq!(rows, 0);
    // The rejected item stays rejected, as when leaving on one's own
    let rejected: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM event_products WHERE event_id = $1 AND status = 'rejected'",
    )
    .bind(b.event)
    .fetch_one(&b.db)
    .await
    .unwrap();
    assert_eq!(rejected, 1);
    assert!(b.without_items_in_list().await.is_empty());

    // One mail each, a second apart like messages to sellers
    let mails: Vec<Value> = sqlx::query_scalar(
        "SELECT payload FROM jobs WHERE kind = 'mail.notification' AND payload::text LIKE '%abgemeldet%'",
    )
    .fetch_all(&b.db)
    .await
    .unwrap();
    assert_eq!(mails.len(), 2, "{mails:?}");
    assert!(
        mails
            .iter()
            .all(|mail| mail.to_string().contains("Die Plätze sind knapp.")),
        "{mails:?}"
    );

    // Not excluded: Ben's place is free and he joins again
    let ben_session = fixtures::session(&b.db, ben).await;
    let again = b.join(&ben_session, json!({})).await;
    assert_eq!(again.status, StatusCode::OK, "{}", again.body);

    // Nothing left to do: none, and no mails
    let reply = b.unregister(&b.organizer, None).await;
    assert_eq!(reply.body["value"], 1);
    let reply = b.unregister(&b.organizer, None).await;
    assert_eq!(reply.body["value"], 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_item_announced_meanwhile_keeps_its_seller(db: PgPool) {
    let b = Bazaar::new(db, json!({ "photosOptional": true })).await;
    let mut sellers = Vec::new();
    let mut products = Vec::new();
    for index in 0..8 {
        let (user, session) = b.seller(&format!("Seller {index}")).await;
        products.push(fixtures::product(&b.db, user, "Rad", 50.0).await);
        sellers.push((user, session));
    }
    // Every seller announces an item they made before, while the organizer unregisters
    // those without
    let announcing = sellers
        .iter()
        .zip(&products)
        .map(|((_, session), product)| b.announce_product(*product, session));
    let (unregistered, announced) = tokio::join!(
        b.unregister(&b.organizer, None),
        futures::future::join_all(announcing)
    );
    assert_eq!(unregistered.status, StatusCode::OK, "{}", unregistered.body);
    for ((user, _), reply) in sellers.iter().zip(announced) {
        let item: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                            WHERE ep.event_id = $1 AND p.vendor_id = $2)",
        )
        .bind(b.event)
        .bind(user)
        .fetch_one(&b.db)
        .await
        .unwrap();
        // Either the item came first and the seller stays, or the seller left first and
        // the item was refused: never an item of someone no longer at the bazaar
        if reply.status == StatusCode::OK {
            let seller = b.is_seller(*user).await;
            assert!(
                item && seller,
                "item {item}, seller {seller}, {}",
                unregistered.body
            );
        } else {
            assert_eq!(
                reply.body["code"], "product.notRegistered",
                "{}",
                reply.body
            );
            assert!(!item && !b.is_seller(*user).await);
        }
    }
}
