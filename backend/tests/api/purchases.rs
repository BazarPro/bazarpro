//! The cash desk.

use crate::common;

use axum::http::StatusCode;
use common::desk::Desk;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn half_cents_round_up_like_in_the_app(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Mütze", 1.25).await;
    let reply = desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // 10 % of 1.25 is 0.125: 0.13 commission, not 0.12 as rounding to even would give
    assert_eq!(
        desk.purchase(product).await,
        Some((1.25, 0.13, 1.12, Some("list".into()), None))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_sale_records_the_price_and_mails_seller_and_buyer(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 19.99).await;
    let bad = desk
        .sell(json!({ "eventProductId": relation, "buyerEmail": "kein-mail" }))
        .await;
    assert!(
        bad.body["message"]
            .as_str()
            .unwrap()
            .contains("gültige E-Mail")
    );
    let reply = desk
        .sell(json!({ "eventProductId": relation, "buyerEmail": "kaeufer@example.com" }))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);

    // 10 % of 19.99 is 2.00 after rounding; commission and payout add up to the price
    assert_eq!(
        desk.purchase(product).await,
        Some((19.99, 2.0, 17.99, Some("list".into()), None))
    );
    let sold: (bool, String) = sqlx::query_as(
        "SELECT p.sold, ep.status::text FROM products p JOIN event_products ep ON ep.product_id = p.id WHERE p.id = $1",
    )
    .bind(product)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(sold, (true, "sold".to_owned()));
    let mails = desk.mails().await;
    assert_eq!(
        mails,
        vec![
            ("kaeufer@example.com".into(), "Dein Kaufbeleg: Ski".into()),
            ("seller@test.example".into(), "Verkauft: Ski".into()),
        ]
    );
    let receipt = desk
        .app
        .sent
        .lock()
        .unwrap()
        .iter()
        .find(|m| m.to == "kaeufer@example.com")
        .unwrap()
        .html
        .clone();
    assert!(receipt.contains("19,99 €"));

    // Not twice
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation })).await.body["code"],
        "product.notForSale"
    );
    let marker = desk
        .app
        .query(
            "notifications.getUnreadNoticeCounts",
            json!({}),
            Some(&fixtures::session(&db, desk.seller).await),
        )
        .await;
    assert_eq!(marker.body["value"]["sales"], 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn discounts_offers_and_negotiated_prices(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "minimumPrice": true })).await;
    let (discounted, relation) = desk.item("Rabatt", 50.0).await;
    sqlx::query("UPDATE event_products SET discount_percent = 20 WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(
        desk.purchase(discounted).await,
        Some((40.0, 4.0, 36.0, Some("list".into()), Some(20.0)))
    );

    let (negotiable, relation) = desk.item("VB", 50.0).await;
    sqlx::query("UPDATE products SET minimum_price = 30 WHERE id = $1")
        .bind(negotiable)
        .execute(&db)
        .await
        .unwrap();
    let below = desk
        .sell(json!({ "eventProductId": relation, "negotiatedPrice": 25 }))
        .await;
    assert_eq!(below.body["code"], "checkout.priceRange");
    assert_eq!(
        below.body["params"],
        json!({ "min": "30,00 €", "max": "50,00 €" })
    );
    desk.sell(json!({ "eventProductId": relation, "negotiatedPrice": 35.004 }))
        .await;
    assert_eq!(
        desk.purchase(negotiable).await,
        Some((35.0, 3.5, 31.5, Some("negotiated".into()), None))
    );

    let (fixed, relation) = desk.item("Fest", 50.0).await;
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation, "negotiatedPrice": 40 }))
            .await
            .body["code"],
        "checkout.noNegotiation"
    );
    let buyer = fixtures::user(&db, "Buyer").await;
    let offer: Uuid = sqlx::query_scalar(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status)
         VALUES ($1, $2, $3, $4, 42, 'pending') RETURNING id",
    )
    .bind(desk.event)
    .bind(fixed)
    .bind(relation)
    .bind(buyer)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation, "offerId": offer }))
            .await
            .body["code"],
        "checkout.offerNotAccepted"
    );
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation, "offerId": offer, "negotiatedPrice": 40 }))
            .await
            .body["code"],
        "checkout.offerOrNegotiated"
    );
    sqlx::query("UPDATE product_offers SET status = 'accepted' WHERE id = $1")
        .bind(offer)
        .execute(&db)
        .await
        .unwrap();
    desk.sell(json!({ "eventProductId": relation, "offerId": offer }))
        .await;
    assert_eq!(
        desk.purchase(fixed).await,
        Some((42.0, 4.2, 37.8, Some("offer".into()), None))
    );
    let status: String =
        sqlx::query_scalar("SELECT status::text FROM product_offers WHERE id = $1")
            .bind(offer)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(status, "redeemed");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_cart_sells_everything_or_nothing(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let other = fixtures::user(&db, "Other").await;
    fixtures::role(&db, desk.event, other, "seller").await;
    let (a, ra) = desk.item("A", 10.0).await;
    let (b, rb) = desk.item("B", 20.0).await;
    let (c, rc) = desk.item_of(other, "C", 5.0).await;

    let reply = desk
        .cart(
            json!([{ "eventProductId": ra }, { "eventProductId": rb }, { "eventProductId": rc }]),
            Some("k@example.com"),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"]["total"], 35.0);
    assert_eq!(
        reply.body["value"]["purchaseIds"].as_array().unwrap().len(),
        3
    );
    for product in [a, b, c] {
        assert!(desk.purchase(product).await.is_some());
    }
    // One mail per seller and one receipt
    let mails = desk.mails().await;
    assert_eq!(
        mails,
        vec![
            (
                "k@example.com".into(),
                "Dein Kaufbeleg: 3 Artikel bei Basar".into()
            ),
            ("other@test.example".into(), "Verkauft: C".into()),
            (
                "seller@test.example".into(),
                "Verkauft: 2 Artikel bei Basar".into()
            ),
        ]
    );

    // One item already sold: nothing is sold, the error names it
    let (d, rd) = desk.item("D", 1.0).await;
    let failed = desk
        .cart(
            json!([{ "eventProductId": rd }, { "eventProductId": ra }]),
            None,
        )
        .await;
    assert_eq!(failed.body["code"], "checkout.itemFailed");
    assert_eq!(failed.body["cause"]["code"], "product.notForSale");
    assert_eq!(
        failed.body["message"],
        "„A“: Der Artikel ist nicht verkäuflich."
    );
    assert!(desk.purchase(d).await.is_none());

    assert_eq!(
        desk.cart(json!([]), None).await.body["code"],
        "checkout.empty"
    );
    assert_eq!(
        desk.cart(
            json!([{ "eventProductId": rd }, { "eventProductId": rd }]),
            None
        )
        .await
        .body["code"],
        "checkout.duplicate"
    );
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    let foreign = desk
        .app
        .mutation(
            "purchases.sellProducts",
            json!({ "items": [{ "eventProductId": rd }] }),
            Some(&stranger),
        )
        .await;
    // Checked once for the cart, before any item: not one item's failure
    assert_eq!(foreign.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn items_of_two_events_cannot_be_sold_together(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (_, here) = desk.item("Hier", 10.0).await;
    let organizer: Uuid = sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
        .bind(desk.event)
        .fetch_one(&db)
        .await
        .unwrap();
    let second = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            ..EventSpec::new("Zweiter", organizer)
        },
    )
    .await;
    let product = fixtures::product(&db, desk.seller, "Dort", 5.0).await;
    let there = fixtures::event_product(&db, second, product, "available").await;
    let reply = desk
        .cart(
            json!([{ "eventProductId": here }, { "eventProductId": there }]),
            None,
        )
        .await;
    assert_eq!(reply.body["cause"]["code"], "checkout.mixedEvents");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_paid_out_seller_sells_nothing_more(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (_, relation) = desk.item("Ski", 10.0).await;
    fixtures::event_seller(&db, desk.event, desk.seller, 1, true).await;
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation })).await.body["code"],
        "seller.paidOutNoSales"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_sold_item_leaves_its_other_events_and_offers(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 10.0).await;
    let organizer: Uuid = sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
        .bind(desk.event)
        .fetch_one(&db)
        .await
        .unwrap();
    let later = fixtures::event(&db, EventSpec::new("Später", organizer)).await;
    fixtures::event_product(&db, later, product, "announced").await;
    let buyer = fixtures::user(&db, "Buyer").await;
    sqlx::query("INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status) VALUES ($1, $2, $3, $4, 8, 'pending')")
        .bind(desk.event).bind(product).bind(relation).bind(buyer).execute(&db).await.unwrap();
    desk.sell(json!({ "eventProductId": relation })).await;
    let events: Vec<Uuid> =
        sqlx::query_scalar("SELECT event_id FROM event_products WHERE product_id = $1")
            .bind(product)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(events, vec![desk.event]);
    let offer: (String, Option<String>) =
        sqlx::query_as("SELECT status::text, closed_by::text FROM product_offers")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(offer, ("rejected".into(), Some("sale".into())));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn undoing_a_sale_restores_item_and_offers(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    let buyer = fixtures::user(&db, "Buyer").await;
    let other_buyer = fixtures::user(&db, "Other Buyer").await;
    let offer: Uuid = sqlx::query_scalar(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status)
         VALUES ($1, $2, $3, $4, 40, 'accepted') RETURNING id",
    )
    .bind(desk.event).bind(product).bind(relation).bind(buyer).fetch_one(&db).await.unwrap();
    sqlx::query("INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status) VALUES ($1, $2, $3, $4, 30, 'pending')")
        .bind(desk.event).bind(product).bind(relation).bind(other_buyer).execute(&db).await.unwrap();
    desk.sell(json!({ "eventProductId": relation, "offerId": offer }))
        .await;

    let undo = || {
        desk.app.mutation(
            "purchases.undoSale",
            json!({ "eventProductId": relation }),
            Some(&desk.team),
        )
    };
    assert_eq!(undo().await.body["code"], "feature.disabled");
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ('allow_undo_inventory_actions', true)",
    )
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(undo().await.body["value"], json!({ "success": true }));
    assert!(desk.purchase(product).await.is_none());
    let statuses: Vec<String> =
        sqlx::query_scalar("SELECT status::text FROM product_offers ORDER BY amount DESC")
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(statuses, vec!["accepted", "pending"]);
    let (sold, status): (bool, String) = sqlx::query_as(
        "SELECT p.sold, ep.status::text FROM products p JOIN event_products ep ON ep.product_id = p.id WHERE p.id = $1",
    )
    .bind(product)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!((sold, status.as_str()), (false, "available"));
    assert_eq!(undo().await.body["code"], "product.notSold");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_checkout_item_for_the_scanner(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "minimumPrice": true })).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    sqlx::query("UPDATE products SET minimum_price = 30 WHERE id = $1")
        .bind(product)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE event_products SET discount_percent = 10, internal_note = 'Haken 12' WHERE id = $1",
    )
    .bind(relation)
    .execute(&db)
    .await
    .unwrap();
    let item = |id: String| {
        let (app, args, team) = (
            &desk.app,
            json!({ "eventId": desk.event, "productId": id }),
            desk.team.clone(),
        );
        async move {
            app.query("purchases.getCheckoutItem", args, Some(&team))
                .await
        }
    };
    let reply = item(product.to_string()).await.body["value"].clone();
    assert_eq!(
        (
            reply["listPrice"].clone(),
            reply["minimumPrice"].clone(),
            reply["sellerPaidOut"].clone()
        ),
        (json!(45.0), json!(30.0), json!(false))
    );
    assert_eq!(reply["eventProductId"], json!(relation));
    assert_eq!(reply["image"], Value::Null);
    assert_eq!(reply["internalNote"], "Haken 12");
    // Whatever the scanner reads: no error, just nothing
    assert_eq!(item("kaputt-123".into()).await.body["value"], Value::Null);
    assert_eq!(
        item(Uuid::new_v4().to_string()).await.body["value"],
        Value::Null
    );
    let seller = fixtures::session(&db, desk.seller).await;
    let forbidden = desk
        .app
        .query(
            "purchases.getCheckoutItem",
            json!({ "eventId": desk.event, "productId": product }),
            Some(&seller),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn my_sales_per_event_with_the_intake_fee(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "intakeFee": 0.5 })).await;
    let (product, relation) = desk.item("Ski", 30.0).await;
    desk.item("Helm", 5.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    let seller = fixtures::session(&db, desk.seller).await;
    let sales = desk
        .app
        .query("purchases.getMySales", json!({}), Some(&seller))
        .await
        .body["value"]
        .clone();
    assert_eq!(sales.as_array().unwrap().len(), 1);
    let group = &sales[0];
    assert_eq!(group["event"]["title"], "Basar");
    assert_eq!(group["event"]["commissionPercent"], 10.0);
    assert_eq!(group["items"][0]["productId"], json!(product));
    assert_eq!(group["items"][0]["sale"]["totalAmount"], 30.0);
    assert_eq!(
        group["totals"],
        json!({ "revenue": 30.0, "commission": 3.0, "intakeFee": { "perItem": 0.5, "items": 2, "total": 1.0 }, "feeCapCredit": 0.0, "payout": 26.0 })
    );
    assert_eq!(group["paid"], false);
    assert_eq!(
        desk.app
            .query("purchases.getMySales", json!({}), None)
            .await
            .body["value"],
        json!([])
    );

    let purchases = desk
        .app
        .query(
            "purchases.getPurchasesForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(purchases.body["value"][0]["comissionAmount"], 3.0);
    assert_eq!(
        desk.app
            .query(
                "purchases.getPurchasesForEvent",
                json!({ "eventId": desk.event }),
                Some(&seller)
            )
            .await
            .body["code"],
        "auth.forbidden"
    );
}

/// One offline sale as the app queues it; `items` are (event product, product, paid).
fn offline_sale(id: Uuid, items: &[(Uuid, Uuid, f64)]) -> Value {
    json!({
        "deskSaleId": id,
        "soldAt": 1_700_000_000_000_i64,
        "items": items
            .iter()
            .map(|(relation, product, paid)| json!({
                "eventProductId": relation,
                "productId": product,
                "title": "Aus dem Snapshot",
                "paid": paid,
                "priceSource": "list",
            }))
            .collect::<Vec<_>>(),
    })
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_offline_sale_is_booked_once_at_the_price_taken(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 20.0).await;
    // The seller gave a discount after the desk loaded its copy: the buyer paid 20 €
    sqlx::query("UPDATE event_products SET discount_percent = 50 WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    let sale = Uuid::new_v4();
    let reply = desk
        .sync(json!([offline_sale(sale, &[(relation, product, 20.0)])]))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let first = &reply.body["value"][0];
    assert_eq!(first["bookedNow"], true);
    assert_eq!(first["conflicts"], json!([]));
    assert_eq!(
        desk.purchase(product).await,
        Some((20.0, 2.0, 18.0, Some("list".into()), Some(50.0)))
    );
    // Counted from when the buyer paid
    let created: f64 = sqlx::query_scalar(
        "SELECT extract(epoch FROM created_at)::float8 FROM purchases WHERE product_id = $1",
    )
    .bind(product)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(created, 1_700_000_000.0);

    // The reply got lost and the app sends the sale again: nothing is booked twice
    let again = desk
        .sync(json!([offline_sale(sale, &[(relation, product, 20.0)])]))
        .await;
    assert_eq!(again.body["value"][0]["bookedNow"], false);
    assert_eq!(again.body["value"][0]["purchaseIds"], first["purchaseIds"]);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM purchases")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let conflicts: i64 = sqlx::query_scalar("SELECT count(*) FROM sale_conflicts")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(conflicts, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_item_sold_at_two_offline_desks_becomes_a_conflict(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (ski, ski_relation) = desk.item("Ski", 20.0).await;
    let (helm, helm_relation) = desk.item("Helm", 5.0).await;
    let first = desk
        .sync(json!([offline_sale(
            Uuid::new_v4(),
            &[(ski_relation, ski, 20.0)]
        )]))
        .await;
    assert_eq!(first.body["value"][0]["conflicts"], json!([]));

    // The second desk sold the same skis and a helmet: the helmet is booked, the skis not
    let second = desk
        .sync(json!([offline_sale(
            Uuid::new_v4(),
            &[(ski_relation, ski, 18.0), (helm_relation, helm, 5.0)]
        )]))
        .await;
    assert_eq!(second.status, StatusCode::OK, "{}", second.body);
    assert_eq!(second.body["value"][0]["conflicts"], json!([ski]));
    assert_eq!(
        second.body["value"][0]["purchaseIds"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(desk.purchase(helm).await.is_some());

    let conflicts = desk
        .app
        .query(
            "purchases.getSaleConflicts",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(conflicts.as_array().unwrap().len(), 1);
    let conflict = &conflicts[0];
    assert_eq!(conflict["productId"], json!(ski));
    assert_eq!(conflict["title"], "Ski");
    assert_eq!(conflict["amount"], 18.0);
    assert_eq!(conflict["reason"], "product.notForSale");
    assert_eq!(conflict["cashier"], "Orga");
    assert!(conflict.get("resolvedAt").is_none());

    let resolved = desk
        .app
        .mutation(
            "purchases.resolveSaleConflict",
            json!({ "conflictId": conflict["_id"] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(resolved.status, StatusCode::OK, "{}", resolved.body);
    let after = desk
        .app
        .query(
            "purchases.getSaleConflicts",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert!(after.body["value"][0]["resolvedAt"].is_number());

    let seller = fixtures::session(&db, desk.seller).await;
    let foreign = desk
        .app
        .mutation(
            "purchases.resolveSaleConflict",
            json!({ "conflictId": conflict["_id"] }),
            Some(&seller),
        )
        .await;
    assert_eq!(foreign.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_impossible_offline_amount_is_a_conflict_and_the_batch_is_booked(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (ski, ski_relation) = desk.item("Ski", 20.0).await;
    let (helm, helm_relation) = desk.item("Helm", 5.0).await;
    let (jacke, jacke_relation) = desk.item("Jacke", 9.0).await;
    let damaged = Uuid::new_v4();
    let reply = desk
        .sync(json!([
            offline_sale(Uuid::new_v4(), &[(ski_relation, ski, 20.0)]),
            // A damaged queue entry, and one just over the highest price
            offline_sale(
                damaged,
                &[
                    (helm_relation, helm, 1e27),
                    (jacke_relation, jacke, 10_000.0)
                ]
            ),
        ]))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["conflicts"], json!([]));
    assert_eq!(reply.body["value"][1]["conflicts"], json!([helm, jacke]));
    assert!(desk.purchase(ski).await.is_some());
    assert!(desk.purchase(helm).await.is_none());
    let reasons: Vec<(String, f64)> = sqlx::query_as(
        "SELECT reason, amount::float8 FROM sale_conflicts WHERE desk_sale_id = $1 ORDER BY amount",
    )
    .bind(damaged)
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(
        reasons,
        vec![
            ("checkout.invalidPrice".into(), 0.0),
            ("checkout.invalidPrice".into(), 10_000.0)
        ]
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn offline_sales_after_the_payout_and_of_vanished_items_are_conflicts(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (paid, paid_relation) = desk.item("Ausgezahlt", 10.0).await;
    fixtures::event_seller(&db, desk.event, desk.seller, 1, true).await;
    let gone = Uuid::new_v4();
    let reply = desk
        .sync(json!([offline_sale(
            Uuid::new_v4(),
            &[(paid_relation, paid, 10.0), (Uuid::new_v4(), gone, 3.0)]
        )]))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["conflicts"], json!([paid, gone]));
    let reasons: Vec<(Option<Uuid>, String, String)> =
        sqlx::query_as("SELECT product_id, title, reason FROM sale_conflicts ORDER BY amount DESC")
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(
        reasons,
        vec![
            (
                Some(paid),
                "Ausgezahlt".into(),
                "seller.paidOutNoSales".into()
            ),
            (None, "Aus dem Snapshot".into(), "notFound.product".into()),
        ]
    );
    assert!(desk.purchase(paid).await.is_none());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn no_desk_books_a_direct_sale_at_a_bazaar_without_them(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    let mut sale = offline_sale(Uuid::new_v4(), &[(relation, product, 50.0)]);
    sale["directSale"] = json!(true);
    let reply = desk.sync(json!([sale])).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["conflicts"], json!([product]));
    let reason: String = sqlx::query_scalar("SELECT reason FROM sale_conflicts")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(reason, "checkout.directSaleMismatch");
    // The seller is not booked with nothing to get
    assert!(desk.purchase(product).await.is_none());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_cart_sent_twice_is_sold_once(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 20.0).await;
    let args = json!({ "items": [{ "eventProductId": relation }], "deskSaleId": Uuid::new_v4() });
    let first = desk
        .app
        .mutation("purchases.sellProducts", args.clone(), Some(&desk.team))
        .await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.body);
    let second = desk
        .app
        .mutation("purchases.sellProducts", args, Some(&desk.team))
        .await;
    assert_eq!(second.status, StatusCode::OK, "{}", second.body);
    assert_eq!(second.body["value"], first.body["value"]);
    assert_eq!(second.body["value"]["total"], 20.0);
    assert!(desk.purchase(product).await.is_some());
    // One mail to the seller, not two
    assert_eq!(desk.mails().await.len(), 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_snapshot_for_an_offline_desk(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "minimumPrice": true })).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    sqlx::query("UPDATE products SET minimum_price = 30 WHERE id = $1")
        .bind(product)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("UPDATE event_products SET discount_percent = 10 WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    let (sold, sold_relation) = desk.item("Helm", 5.0).await;
    desk.sell(json!({ "eventProductId": sold_relation })).await;
    let buyer = fixtures::user(&db, "Buyer").await;
    let offer: Uuid = sqlx::query_scalar(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status)
         VALUES ($1, $2, $3, $4, 40, 'accepted') RETURNING id",
    )
    .bind(desk.event)
    .bind(product)
    .bind(relation)
    .bind(buyer)
    .fetch_one(&db)
    .await
    .unwrap();

    let reply = desk
        .app
        .query(
            "purchases.getCheckoutSnapshot",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let snapshot = &reply.body["value"];
    assert!(snapshot["takenAt"].is_number());
    let items = snapshot["items"].as_array().unwrap();
    let ski = items
        .iter()
        .find(|i| i["productId"] == json!(product))
        .unwrap();
    assert_eq!(ski["eventProductId"], json!(relation));
    assert_eq!(ski["listPrice"], 45.0);
    assert_eq!(ski["minimumPrice"], 30.0);
    assert_eq!(ski["status"], "available");
    assert_eq!(ski["offers"][0]["_id"], json!(offer));
    assert_eq!(ski["offers"][0]["amount"], 40.0);
    let helm = items
        .iter()
        .find(|i| i["productId"] == json!(sold))
        .unwrap();
    assert_eq!(helm["status"], "sold");
    assert_eq!(helm["offers"], json!([]));

    let seller = fixtures::session(&db, desk.seller).await;
    let forbidden = desk
        .app
        .query(
            "purchases.getCheckoutSnapshot",
            json!({ "eventId": desk.event }),
            Some(&seller),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_direct_sale_takes_only_the_commission(db: PgPool) {
    // The buyer paid the seller at the bike; the desk books it at the agreed price
    let desk = Desk::new(db.clone(), json!({ "directSale": true })).await;
    let (agreed, agreed_relation) = desk.item("Trekkingrad", 280.0).await;
    let (listed, listed_relation) = desk.item("Hollandrad", 190.0).await;
    // Without a minimum price any agreed price up to the label counts
    let above = desk
        .cart(
            json!([{ "eventProductId": agreed_relation, "negotiatedPrice": 300 }]),
            None,
        )
        .await;
    assert_eq!(above.body["code"], "checkout.itemFailed", "{}", above.body);
    let reply = desk
        .cart(
            json!([
                { "eventProductId": agreed_relation, "negotiatedPrice": 250 },
                { "eventProductId": listed_relation },
            ]),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // The desk took 10 % of 440 €, nothing is paid out
    assert_eq!(reply.body["value"]["total"], json!(440.0));
    assert_eq!(reply.body["value"]["taken"], json!(44.0));
    assert_eq!(
        desk.purchase(agreed).await,
        Some((250.0, 25.0, 0.0, Some("negotiated".into()), None))
    );
    assert_eq!(
        desk.purchase(listed).await,
        Some((190.0, 19.0, 0.0, Some("list".into()), None))
    );
    let direct: i64 = sqlx::query_scalar("SELECT count(*) FROM purchases WHERE direct_sale")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(direct, 2);

    // The till holds the commission only; the seller is owed nothing
    let summary = desk
        .app
        .query(
            "events.getEventFinancialSummary",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(summary.status, StatusCode::OK, "{}", summary.body);
    let summary = &summary.body["value"];
    assert_eq!(summary["cashInHandSoll"], json!(44.0), "{summary}");
    assert_eq!(summary["totalDirectSales"], json!(440.0));
    assert_eq!(summary["totalDirectCommission"], json!(44.0));
    assert_eq!(summary["totalPendingPayout"], json!(0.0));

    // The seller's mail names the commission paid at the desk and no payout
    let mail = desk
        .mails()
        .await
        .into_iter()
        .find(|(to, _)| to == "seller@test.example");
    assert!(mail.is_some());
    let html = desk
        .app
        .sent
        .lock()
        .unwrap()
        .iter()
        .find(|m| m.to == "seller@test.example")
        .unwrap()
        .html
        .clone();
    assert!(html.contains("an der Kasse bezahlt"), "{html}");
    assert!(!html.contains("Auszahlung</"), "{html}");
}

/// editEvent with `directSale` set, everything else as the event is.
async fn switch_direct_sale(desk: &Desk, on: bool) -> common::Reply {
    let event = desk
        .app
        .query(
            "events.getEvent",
            json!({ "id": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    let mut args = json!({ "id": desk.event, "features": { "directSale": on } });
    for key in [
        "title",
        "description",
        "location",
        "startDate",
        "endDate",
        "categories",
        "contactInfo",
        "commission",
        "services",
        "visibility",
    ] {
        args[key] = event[key].clone();
    }
    desk.app
        .mutation("events.editEvent", args, Some(&desk.team))
        .await
}

async fn is_direct(db: &PgPool, product: Uuid) -> bool {
    sqlx::query_scalar("SELECT direct_sale FROM purchases WHERE product_id = $1")
        .bind(product)
        .fetch_one(db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_offline_sale_is_booked_the_way_the_desk_sold_it(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (normal, normal_relation) = desk.item("Ski", 50.0).await;
    let (direct, direct_relation) = desk.item("Rad", 200.0).await;
    let (older, older_relation) = desk.item("Roller", 30.0).await;
    // The desk took 50 € into the till offline; before the queue is booked the organizer
    // switches to direct sale, which is possible while nothing is sold
    let switched = switch_direct_sale(&desk, true).await;
    assert_eq!(switched.status, StatusCode::OK, "{}", switched.body);

    let mut as_normal = offline_sale(Uuid::new_v4(), &[(normal_relation, normal, 50.0)]);
    as_normal["directSale"] = json!(false);
    let mut as_direct = offline_sale(Uuid::new_v4(), &[(direct_relation, direct, 180.0)]);
    as_direct["directSale"] = json!(true);
    // An older app does not say how it sold: as the event says
    let unsaid = offline_sale(Uuid::new_v4(), &[(older_relation, older, 30.0)]);
    let reply = desk.sync(json!([as_normal, as_direct, unsaid])).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);

    // The seller is still owed the 45 € that are in the till
    assert_eq!(
        desk.purchase(normal).await,
        Some((50.0, 5.0, 45.0, Some("list".into()), None))
    );
    assert!(!is_direct(&db, normal).await);
    assert_eq!(
        desk.purchase(direct).await,
        Some((180.0, 18.0, 0.0, Some("list".into()), None))
    );
    assert!(is_direct(&db, direct).await);
    assert!(is_direct(&db, older).await);

    let summary = desk
        .app
        .query(
            "events.getEventFinancialSummary",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    // 50 € + the commissions of the direct sales (18 € + 3 €)
    assert_eq!(summary["cashInHandSoll"], json!(71.0), "{summary}");
    assert_eq!(summary["totalPendingPayout"], json!(45.0));
    // One seller with money to settle
    assert_eq!(summary["vendorsTotalCount"], json!(1));

    // With sales booked the way of selling stays
    let back = switch_direct_sale(&desk, false).await;
    assert_eq!(back.body["code"], "event.directSaleLocked", "{}", back.body);
    let same = switch_direct_sale(&desk, true).await;
    assert_eq!(same.status, StatusCode::OK, "{}", same.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn direct_sellers_have_nothing_to_settle(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "directSale": true })).await;
    // A label of one cent can be booked at one cent: no minimum price is involved
    let (cheap, cheap_relation) = desk.item("Klingel", 0.01).await;
    let (_, bike_relation) = desk.item("Rad", 250.0).await;
    let reply = desk
        .cart(
            json!([
                { "eventProductId": cheap_relation, "negotiatedPrice": 0.01 },
                { "eventProductId": bike_relation, "negotiatedPrice": 200 },
            ]),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        desk.purchase(cheap).await,
        Some((0.01, 0.0, 0.0, Some("negotiated".into()), None))
    );

    let summary = desk
        .app
        .query(
            "events.getEventFinancialSummary",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    // Nobody waits for a payout, so nobody counts as open
    assert_eq!(summary["vendorsTotalCount"], json!(0), "{summary}");
    assert_eq!(summary["vendorsPaidCount"], json!(0));

    let vendors = desk
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(vendors.status, StatusCode::OK, "{}", vendors.body);
    let seller = &vendors.body["value"][0];
    assert_eq!(seller["payout"], json!(0.0), "{seller}");
    // 200.01 € from the buyers, less 20 € commission
    assert_eq!(seller["receivedDirectly"], json!(180.01));
}

async fn vendor_of(desk: &Desk) -> Value {
    let vendors = desk
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(vendors.status, StatusCode::OK, "{}", vendors.body);
    vendors.body["value"][0].clone()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_fee_cap_gives_back_what_is_above_it_at_the_payout(db: PgPool) {
    // 10 % commission, 3 € per bike handed in, at most 20 € of fees per seller
    let desk = Desk::new(
        db.clone(),
        json!({ "intakeFee": 3, "maxFeesPerSeller": 20 }),
    )
    .await;
    let (_, ebike) = desk.item("E-Bike", 140.0).await;
    let (_, trekking) = desk.item("Trekkingrad", 90.0).await;
    desk.sell(json!({ "eventProductId": ebike })).await;
    // Each sale keeps its full commission; the cap works on the sum
    let vendor = vendor_of(&desk).await;
    assert_eq!(vendor["commission"], json!(14.0));
    // 14 € + 2 × 3 € is just above the cap
    assert_eq!(vendor["feeCapCredit"], json!(0.0));
    assert_eq!(vendor["payout"], json!(126.0 - 6.0));

    desk.sell(json!({ "eventProductId": trekking })).await;
    // 23 € commission + 6 € intake fee = 29 €: 9 € come back
    let vendor = vendor_of(&desk).await;
    assert_eq!(vendor["feeCapCredit"], json!(9.0), "{vendor}");
    assert_eq!(vendor["payout"], json!(230.0 - 20.0));
    let seller = fixtures::session(&db, desk.seller).await;
    let sales = desk
        .app
        .query("purchases.getMySales", json!({}), Some(&seller))
        .await;
    let totals = &sales.body["value"][0]["totals"];
    assert_eq!(totals["feeCapCredit"], json!(9.0), "{totals}");
    assert_eq!(totals["payout"], json!(210.0));

    // The payout stores the credit; a later change of the cap does not alter it
    let args = json!({ "eventId": desk.event, "vendorUserId": desk.seller });
    let paid = desk
        .app
        .mutation("eventSeller.settleVendor", args.clone(), Some(&desk.team))
        .await;
    assert_eq!(paid.status, StatusCode::OK, "{}", paid.body);
    let stored: (f64, Option<f64>) = sqlx::query_as(
        "SELECT payout_amount::float8, fee_cap_credit::float8 FROM event_sellers
         WHERE event_id = $1 AND user_id = $2",
    )
    .bind(desk.event)
    .bind(desk.seller)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(stored, (210.0, Some(9.0)));
    sqlx::query(
        "UPDATE events SET features = '{\"intakeFee\": 3, \"maxFeesPerSeller\": 10}' WHERE id = $1",
    )
    .bind(desk.event)
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(vendor_of(&desk).await["payout"], json!(210.0));
    let summary = desk
        .app
        .query(
            "events.getEventFinancialSummary",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(summary["totalFeeCapCredits"], json!(9.0), "{summary}");
    assert_eq!(summary["totalPaidOut"], json!(210.0));
    // 230 € taken, 210 € paid out: the bazaar keeps exactly the cap
    assert_eq!(summary["cashInHandSoll"], json!(20.0));

    // Taking the payout back clears it; the new cap counts from then on
    let undone = desk
        .app
        .mutation(
            "eventSeller.unmarkVendorPayoutReceived",
            args,
            Some(&desk.team),
        )
        .await;
    assert_eq!(undone.status, StatusCode::OK, "{}", undone.body);
    let vendor = vendor_of(&desk).await;
    assert_eq!(vendor["feeCapCredit"], json!(19.0), "{vendor}");
    assert_eq!(vendor["payout"], json!(220.0));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_direct_sale_takes_commission_only_up_to_the_cap(db: PgPool) {
    let desk = Desk::new(
        db.clone(),
        json!({ "directSale": true, "maxFeesPerSeller": 20, "intakeFee": 2 }),
    )
    .await;
    let (ebike, ebike_relation) = desk.item("E-Bike", 140.0).await;
    let (trekking, trekking_relation) = desk.item("Trekkingrad", 90.0).await;
    let (city, city_relation) = desk.item("Stadtrad", 50.0).await;
    let left = |product: Uuid| {
        let app = &desk.app;
        let team = desk.team.clone();
        async move {
            app.query(
                "purchases.getCheckoutItem",
                json!({ "eventId": desk.event, "productId": product }),
                Some(&team),
            )
            .await
            .body["value"]["feeCapLeft"]
                .clone()
        }
    };
    assert_eq!(left(ebike).await, json!(20.0));

    let reply = desk
        .cart(
            json!([{ "eventProductId": ebike_relation }, { "eventProductId": trekking_relation }]),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // 14 € for the first bike, the rest of the cap (6 € instead of 9 €) for the second
    assert_eq!(reply.body["value"]["taken"], json!(20.0));
    assert_eq!(desk.purchase(ebike).await.unwrap().1, 14.0);
    assert_eq!(desk.purchase(trekking).await.unwrap().1, 6.0);
    assert_eq!(left(city).await, json!(0.0));
    // The cap is reached: no more commission
    desk.sell(json!({ "eventProductId": city_relation })).await;
    assert_eq!(desk.purchase(city).await.unwrap().1, 0.0);

    // The intake fee is above the cap as well: the seller owes nothing at the end
    let vendor = vendor_of(&desk).await;
    assert_eq!(vendor["commission"], json!(20.0));
    assert_eq!(vendor["feeCapCredit"], json!(6.0), "{vendor}");
    assert_eq!(vendor["payout"], json!(0.0));

    // Undone, its commission goes back; the room under the cap goes to the other sales,
    // which owe their full commission again
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ('allow_undo_inventory_actions', true)",
    )
    .execute(&db)
    .await
    .unwrap();
    let undo = desk
        .app
        .mutation(
            "purchases.undoSale",
            json!({ "eventProductId": ebike_relation }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(undo.status, StatusCode::OK, "{}", undo.body);
    // 9 € for the trekking bike, 5 € for the city bike: 6 € of the cap are left
    assert_eq!(desk.purchase(trekking).await.unwrap().1, 9.0);
    assert_eq!(desk.purchase(city).await.unwrap().1, 5.0);
    assert_eq!(left(ebike).await, json!(6.0));
    let vendor = vendor_of(&desk).await;
    assert_eq!(vendor["commission"], json!(14.0));
    // 14 € commission + 6 € intake fee are the cap; the desk took 6 €, the seller pays
    // the other 8 € of commission and the intake fee at the settlement
    assert_eq!(vendor["feeCapCredit"], json!(0.0));
    assert_eq!(vendor["payout"], json!(-14.0), "{vendor}");
    assert_eq!(vendor["receivedDirectly"], json!(140.0 - 6.0));
    let summary = desk
        .app
        .query(
            "events.getEventFinancialSummary",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    // Only what the desk really took is in the till
    assert_eq!(summary["cashInHandSoll"], json!(6.0), "{summary}");
}
