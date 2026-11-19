//! Fee groups (#302): own fees for club members, helpers and other groups.

use crate::common;

use axum::http::StatusCode;
use common::desk::Desk;
use common::fixtures::{self, EventSpec};
use common::{Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

/// 10 % commission, 1 € per item; members 5 % without intake fee, helpers 0 % and up to
/// 40 items instead of 2, bakers (only by the team) 3 %.
fn groups() -> Value {
    json!({
        "intakeFee": 1,
        "maxItemsPerSeller": 2,
        "photosOptional": true,
        "feeGroups": [
            { "id": "members", "label": "Vereinsmitglieder", "commission": 5,
              "assignment": "selfDeclared", "proofHint": "Ausweis zeigen" },
            { "id": "helpers", "label": "Helfer", "commission": 0,
              "maxItemsPerSeller": 40, "assignment": "helpers" },
            { "id": "bakers", "label": "Kuchenspender", "commission": 3,
              "assignment": "manual" }
        ]
    })
}

struct Market {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    organizer: String,
}

impl Market {
    async fn new(db: PgPool) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                commission: 10,
                features: groups(),
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

    async fn join(&self, name: &str, group: Option<&str>) -> (Uuid, String) {
        let user = fixtures::user(&self.db, name).await;
        let session = fixtures::session(&self.db, user).await;
        let joined = self
            .app
            .mutation(
                "eventSeller.joinEvent",
                json!({ "eventId": self.event, "feeGroupId": group }),
                Some(&session),
            )
            .await;
        assert_eq!(joined.status, StatusCode::OK, "{}", joined.body);
        (user, session)
    }

    async fn announced(&self, seller: Uuid, title: &str, price: f64) -> (Uuid, Uuid) {
        let product = fixtures::product(&self.db, seller, title, price).await;
        let relation = fixtures::event_product(&self.db, self.event, product, "announced").await;
        (product, relation)
    }

    async fn accept(&self, relation: Uuid, session: &str) -> Reply {
        self.app
            .mutation(
                "eventProducts.updateProductStatus",
                json!({ "eventProductId": relation, "status": "available" }),
                Some(session),
            )
            .await
    }

    async fn team(&self, name: &str, seller: Uuid, session: &str) -> Reply {
        self.app
            .mutation(
                name,
                json!({ "eventId": self.event, "sellerId": seller }),
                Some(session),
            )
            .await
    }

    async fn vendor(&self, seller: Uuid) -> Value {
        let vendors = self
            .app
            .query(
                "eventRoles.getVendorsForEvent",
                json!({ "eventId": self.event }),
                Some(&self.organizer),
            )
            .await;
        assert_eq!(vendors.status, StatusCode::OK, "{}", vendors.body);
        vendors.body["value"]
            .as_array()
            .unwrap()
            .iter()
            .find(|vendor| vendor["_id"] == json!(seller))
            .cloned()
            .unwrap()
    }

    async fn my_group(&self, session: &str) -> Value {
        self.app
            .query(
                "feeGroups.getMyFeeGroup",
                json!({ "eventId": self.event }),
                Some(session),
            )
            .await
            .body["value"]
            .clone()
    }

    async fn sell(&self, relation: Uuid) {
        let sold = self
            .app
            .mutation(
                "purchases.sellProduct",
                json!({ "eventProductId": relation }),
                Some(&self.organizer),
            )
            .await;
        assert_eq!(sold.status, StatusCode::OK, "{}", sold.body);
    }

    async fn commission(&self, product: Uuid) -> f64 {
        sqlx::query_scalar("SELECT commission_amount::float8 FROM purchases WHERE product_id = $1")
            .bind(product)
            .fetch_one(&self.db)
            .await
            .unwrap()
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_self_declared_group_is_checked_before_the_first_item(db: PgPool) {
    let m = Market::new(db.clone()).await;
    let (seller, session) = m.join("Mitglied", Some("members")).await;
    assert_eq!(
        m.my_group(&session).await,
        json!({ "chosen": "members", "applied": "members", "pending": true, "locked": false })
    );
    let (product, relation) = m.announced(seller, "Rennrad", 200.0).await;

    // The intake asks for the proof first, for one item and for all at once
    let refused = m.accept(relation, &m.organizer).await;
    assert_eq!(
        refused.body["code"], "feeGroup.unconfirmed",
        "{}",
        refused.body
    );
    let all = m
        .app
        .mutation(
            "eventProducts.markAllVendorProductsAvailable",
            json!({ "eventId": m.event, "vendorId": seller }),
            Some(&m.organizer),
        )
        .await;
    assert_eq!(all.body["code"], "feeGroup.unconfirmed");
    let vendor = m.vendor(seller).await;
    assert_eq!(vendor["feeGroup"]["label"], "Vereinsmitglieder");
    assert_eq!(vendor["feeGroup"]["pending"], true);

    // A helper with the intake right confirms
    let helper = fixtures::user(&db, "Helferin").await;
    fixtures::role(&db, m.event, helper, "seller").await;
    fixtures::role(&db, m.event, helper, "coorganizer").await;
    let helper_session = fixtures::session(&db, helper).await;
    let confirmed = m
        .team("feeGroups.confirmFeeGroup", seller, &helper_session)
        .await;
    assert_eq!(confirmed.status, StatusCode::OK, "{}", confirmed.body);
    assert_eq!(m.vendor(seller).await["feeGroup"]["pending"], false);
    let accepted = m.accept(relation, &helper_session).await;
    assert_eq!(accepted.status, StatusCode::OK, "{}", accepted.body);

    // The seller can no longer change it
    let changed = m
        .app
        .mutation(
            "feeGroups.chooseFeeGroup",
            json!({ "eventId": m.event, "groupId": null }),
            Some(&session),
        )
        .await;
    assert_eq!(changed.body["code"], "feeGroup.decided");

    // 5 % of 200 €, no intake fee
    m.sell(relation).await;
    assert_eq!(m.commission(product).await, 10.0);
    let vendor = m.vendor(seller).await;
    assert_eq!(vendor["intakeFee"]["total"], json!(0.0), "{vendor}");
    assert_eq!(vendor["payout"], json!(190.0));
    let sales = m
        .app
        .query("purchases.getMySales", json!({}), Some(&session))
        .await;
    let event = &sales.body["value"][0]["event"];
    assert_eq!(event["commissionPercent"], json!(5.0), "{event}");
    assert_eq!(event["feeGroup"], "Vereinsmitglieder");

    // The payout keeps the group
    let paid = m
        .app
        .mutation(
            "eventSeller.settleVendor",
            json!({ "eventId": m.event, "vendorUserId": seller }),
            Some(&m.organizer),
        )
        .await;
    assert_eq!(paid.status, StatusCode::OK, "{}", paid.body);
    let label: Option<String> = sqlx::query_scalar(
        "SELECT fee_group_label FROM event_sellers WHERE event_id = $1 AND user_id = $2",
    )
    .bind(m.event)
    .bind(seller)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(label.as_deref(), Some("Vereinsmitglieder"));
    let export = m
        .app
        .query(
            "settlement.getExport",
            json!({ "eventId": m.event }),
            Some(&m.organizer),
        )
        .await;
    assert_eq!(export.body["value"]["event"]["feeGroups"], true);
    assert_eq!(
        export.body["value"]["sellers"][0]["feeGroup"],
        "Vereinsmitglieder"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn without_proof_the_bazaars_fees_apply(db: PgPool) {
    let m = Market::new(db.clone()).await;
    let (seller, session) = m.join("Kein Mitglied", Some("members")).await;
    let (product, relation) = m.announced(seller, "Kinderrad", 50.0).await;
    // Only the event team decides
    let by_seller = m.team("feeGroups.removeFeeGroup", seller, &session).await;
    assert_eq!(by_seller.status, StatusCode::FORBIDDEN);
    let removed = m
        .team("feeGroups.removeFeeGroup", seller, &m.organizer)
        .await;
    assert_eq!(removed.status, StatusCode::OK, "{}", removed.body);
    assert_eq!(m.vendor(seller).await["feeGroup"], Value::Null);
    let group = m.my_group(&session).await;
    assert_eq!(group["chosen"], Value::Null, "{group}");
    assert_eq!(group["locked"], true);
    // Choosing again is not possible after the team decided
    let again = m
        .app
        .mutation(
            "feeGroups.chooseFeeGroup",
            json!({ "eventId": m.event, "groupId": "members" }),
            Some(&session),
        )
        .await;
    assert_eq!(again.body["code"], "feeGroup.decided");
    assert_eq!(
        m.accept(relation, &m.organizer).await.status,
        StatusCode::OK
    );
    m.sell(relation).await;
    assert_eq!(m.commission(product).await, 5.0);
    assert_eq!(m.vendor(seller).await["intakeFee"]["total"], json!(1.0));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sellers_choose_only_self_declared_groups_until_the_intake(db: PgPool) {
    let m = Market::new(db.clone()).await;
    let user = fixtures::user(&db, "Schlau").await;
    let session = fixtures::session(&db, user).await;
    let helpers = m
        .app
        .mutation(
            "eventSeller.joinEvent",
            json!({ "eventId": m.event, "feeGroupId": "helpers" }),
            Some(&session),
        )
        .await;
    assert_eq!(helpers.body["code"], "feeGroup.unknown");
    // Groups only the team hands out cannot be chosen either
    let bakers = m
        .app
        .mutation(
            "eventSeller.joinEvent",
            json!({ "eventId": m.event, "feeGroupId": "bakers" }),
            Some(&session),
        )
        .await;
    assert_eq!(bakers.body["code"], "feeGroup.unknown");

    let (seller, session) = m.join("Später", None).await;
    let choose = |group: Value| {
        let (app, session) = (&m.app, session.clone());
        async move {
            app.mutation(
                "feeGroups.chooseFeeGroup",
                json!({ "eventId": m.event, "groupId": group }),
                Some(&session),
            )
            .await
        }
    };
    assert_eq!(choose(json!("members")).await.status, StatusCode::OK);
    assert_eq!(m.my_group(&session).await["pending"], true);
    assert_eq!(choose(Value::Null).await.status, StatusCode::OK);
    assert_eq!(m.my_group(&session).await["chosen"], Value::Null);
    // Without a group nothing stops the intake; afterwards the choice is fixed
    let (_, relation) = m.announced(seller, "Laufrad", 20.0).await;
    assert_eq!(
        m.accept(relation, &m.organizer).await.status,
        StatusCode::OK
    );
    assert_eq!(
        choose(json!("members")).await.body["code"],
        "feeGroup.locked"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_group_only_the_team_hands_out(db: PgPool) {
    let m = Market::new(db.clone()).await;
    let (seller, session) = m.join("Bäcker", None).await;
    let chosen = m
        .app
        .mutation(
            "feeGroups.chooseFeeGroup",
            json!({ "eventId": m.event, "groupId": "bakers" }),
            Some(&session),
        )
        .await;
    assert_eq!(chosen.body["code"], "feeGroup.unknown");
    let assigned = m
        .app
        .mutation(
            "feeGroups.assignFeeGroup",
            json!({ "eventId": m.event, "sellerId": seller, "groupId": "bakers" }),
            Some(&m.organizer),
        )
        .await;
    assert_eq!(assigned.status, StatusCode::OK, "{}", assigned.body);
    // Put in by the team: nothing left to check at the intake
    let group = &m.vendor(seller).await["feeGroup"];
    assert_eq!(group["label"], "Kuchenspender", "{group}");
    assert_eq!(group["pending"], false);
    assert_eq!(m.my_group(&session).await["applied"], "bakers");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn helpers_are_in_their_group_while_they_have_the_role(db: PgPool) {
    let desk = Desk::new(db.clone(), groups()).await;
    fixtures::event_seller(&db, desk.event, desk.seller, 1, false).await;
    let (product, relation) = desk.item("Mountainbike", 300.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(desk.purchase(product).await.unwrap().1, 30.0);

    // Made a helper after the sale: the sale is booked anew at 0 %
    let made = desk
        .app
        .mutation(
            "eventRoles.addCoOrganizerForEvent",
            json!({ "eventId": desk.event, "userId": desk.seller, "permissions": [] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(made.status, StatusCode::OK, "{}", made.body);
    assert_eq!(desk.purchase(product).await.unwrap().1, 0.0);
    let vendors = desk
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    let vendor = &vendors.body["value"][0];
    assert_eq!(vendor["feeGroup"]["label"], "Helfer", "{vendor}");
    assert_eq!(vendor["feeGroup"]["byRole"], true);
    // No commission, and the helper group has no intake fee
    assert_eq!(vendor["payout"], json!(300.0));

    // Without the role again: the bazaar's fees
    let removed = desk
        .app
        .mutation(
            "eventRoles.removeCoOrganizerForEvent",
            json!({ "eventId": desk.event, "userId": desk.seller }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(removed.status, StatusCode::OK, "{}", removed.body);
    assert_eq!(desk.purchase(product).await.unwrap().1, 30.0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_puts_sellers_in_a_group_by_hand(db: PgPool) {
    let m = Market::new(db.clone()).await;
    let (seller, session) = m.join("Kuchenbäckerin", None).await;
    let assign = |group: Value, session: String| {
        let app = &m.app;
        async move {
            app.mutation(
                "feeGroups.assignFeeGroup",
                json!({ "eventId": m.event, "sellerId": seller, "groupId": group }),
                Some(&session),
            )
            .await
        }
    };
    // Helpers may confirm at the intake, but not hand out groups
    let helper = fixtures::user(&db, "Helfer").await;
    fixtures::role(&db, m.event, helper, "seller").await;
    fixtures::role(&db, m.event, helper, "coorganizer").await;
    let helper = fixtures::session(&db, helper).await;
    assert_eq!(
        assign(json!("helpers"), helper).await.body["code"],
        "feeGroup.organizerOnly"
    );
    assert_eq!(
        assign(json!("unknown"), m.organizer.clone()).await.body["code"],
        "feeGroup.unknown"
    );
    let assigned = assign(json!("helpers"), m.organizer.clone()).await;
    assert_eq!(assigned.status, StatusCode::OK, "{}", assigned.body);
    let group = &m.vendor(seller).await["feeGroup"];
    assert_eq!(group["label"], "Helfer", "{group}");
    assert_eq!(group["byRole"], false);
    assert_eq!(group["pending"], false);
    assert_eq!(m.my_group(&session).await["applied"], "helpers");

    // The group's item limit: 40 instead of 2
    for n in 0..3 {
        let product = fixtures::product(&db, seller, &format!("Rad {n}"), 10.0).await;
        let added = m
            .app
            .mutation(
                "eventProducts.addProductToEvent",
                json!({ "eventId": m.event, "productId": product }),
                Some(&session),
            )
            .await;
        assert_eq!(added.status, StatusCode::OK, "{}", added.body);
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn groups_are_checked_when_saved(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let id = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let args = crate::events::edit_args(&app, &session, id).await;
    let save = |groups: Value| {
        let mut args = args.clone();
        args["features"] = json!({ "feeGroups": groups });
        let (app, session) = (&app, session.clone());
        async move {
            app.mutation("events.editEvent", args, Some(&session))
                .await
                .body
        }
    };
    let group = |label: &str, commission: f64| {
        json!({ "id": label.trim().to_lowercase().replace(' ', "-") + "x", "label": label, "commission": commission,
                "assignment": "selfDeclared" })
    };
    assert_eq!(
        save(json!([group(" ", 5.0)])).await["code"],
        "event.feeGroupLabel"
    );
    assert_eq!(
        save(json!([group("Mitglieder", 120.0)])).await["code"],
        "event.feeGroupCommission"
    );
    // Helpers are in their group by role: one such group only
    let mut helpers = group("Helfer", 0.0);
    helpers["assignment"] = json!("helpers");
    let mut more_helpers = group("Aufbauhelfer", 2.0);
    more_helpers["assignment"] = json!("helpers");
    assert_eq!(
        save(json!([helpers, more_helpers])).await["code"],
        "event.feeGroupHelpersTwice"
    );
    // At most 4 groups per bazaar
    let five: Vec<Value> = ["A", "B", "C", "D", "E"]
        .iter()
        .map(|label| group(label, 5.0))
        .collect();
    assert_eq!(save(json!(five)).await["code"], "event.feeGroupsTooMany");
    assert_eq!(save(json!(five[..4])).await["value"], Value::Null);
    let mut twice = group("mitglieder", 5.0);
    twice["id"] = json!("other");
    assert_eq!(
        save(json!([group("Mitglieder", 5.0), twice])).await["code"],
        "event.feeGroupLabelTwice"
    );
    let mut fine = group("Mitglieder", 4.999);
    fine["proofHint"] = json!("  Ausweis zeigen ");
    fine["intakeFee"] = json!(0);
    assert_eq!(save(json!([fine])).await["value"], Value::Null);
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(
        event["features"]["feeGroups"],
        json!([{ "id": "mitgliederx", "label": "Mitglieder", "commission": 5.0,
                 "assignment": "selfDeclared", "proofHint": "Ausweis zeigen" }])
    );
    // An older app leaves them out: they stay
    let mut older = args.clone();
    older["features"] = json!({});
    let kept = app
        .mutation("events.editEvent", older, Some(&session))
        .await;
    assert_eq!(kept.body["value"], Value::Null, "{}", kept.body);
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(event["features"]["feeGroups"][0]["id"], "mitgliederx");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn after_the_first_seller_groups_only_get_cheaper(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let members = |commission: f64| {
        json!({ "id": "members", "label": "Mitglieder", "commission": commission,
                "assignment": "selfDeclared" })
    };
    let id = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "feeGroups": [members(5.0)] }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    fixtures::role(&db, id, fixtures::user(&db, "Seller").await, "seller").await;
    let args = crate::events::edit_args(&app, &session, id).await;
    let save = |groups: Value| {
        let mut args = args.clone();
        args["features"] = json!({ "feeGroups": groups });
        let (app, session) = (&app, session.clone());
        async move {
            app.mutation("events.editEvent", args, Some(&session))
                .await
                .body
        }
    };
    assert_eq!(
        save(json!([members(6.0)])).await["code"],
        "event.feeGroupsOnlyLower"
    );
    assert_eq!(save(json!([])).await["code"], "event.feeGroupsOnlyLower");
    let mut helpers = members(5.0);
    helpers["assignment"] = json!("helpers");
    assert_eq!(
        save(json!([helpers])).await["code"],
        "event.feeGroupsOnlyLower"
    );
    // Cheaper, renamed and a new group are fine
    let mut cheaper = members(3.0);
    cheaper["label"] = json!("Vereinsmitglieder");
    let new = json!({ "id": "kids", "label": "Schüler", "commission": 0,
                      "assignment": "selfDeclared" });
    assert_eq!(save(json!([cheaper, new])).await["value"], Value::Null);
}
