//! Sales, intake fees and payouts as sellers, organizers and receipts need them.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::docs::{Event, EventSeller, Purchase};
use crate::error::{AppError, AppResult};
use crate::money::Cents;
use crate::shape::ms;

/// Days after a bazaar for pick-up, payout and questions (settlement). Afterwards sales and
/// returns can no longer be undone; from #53 on its data is reduced to what the law needs.
pub const SETTLEMENT_DAYS: i64 = 90;

/// Refuses changes to sales and returns of a bazaar whose settlement period is over.
pub fn assert_settlement_open(event: &Event) -> AppResult<()> {
    if event.end_date + chrono::Duration::days(SETTLEMENT_DAYS) < Utc::now() {
        return Err(AppError::bad_request("event.settlementClosed"));
    }
    Ok(())
}

#[skip_serializing_none]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleInfo {
    /// Label price of the item
    pub list_price: Decimal,
    /// Discount at the time of sale; only for sales at the (discounted) list price
    pub discount_percent: Option<Decimal>,
    pub price_source: String,
    /// What the buyer paid
    pub total_amount: Decimal,
    /// Fee the bazaar keeps
    pub commission: Decimal,
    /// What the seller gets from the bazaar; 0 at a direct sale
    pub payout: Decimal,
    /// The buyer paid the seller at the item; the seller paid the commission at the desk
    pub direct_sale: bool,
    #[serde(with = "ms")]
    pub sold_at: DateTime<Utc>,
}

pub fn list_price(purchase: &Purchase) -> Decimal {
    // Older rows have no listPrice; derive it from the discount
    purchase
        .list_price
        .unwrap_or_else(|| match purchase.discount_percent {
            // 100 % leaves no price to derive it from
            Some(percent) if !percent.is_zero() && percent < Decimal::ONE_HUNDRED => {
                (purchase.total_amount / (Decimal::ONE - percent / Decimal::ONE_HUNDRED)).cents()
            }
            _ => purchase.total_amount,
        })
}

pub fn sale_info(purchase: &Purchase) -> SaleInfo {
    SaleInfo {
        list_price: list_price(purchase),
        discount_percent: purchase.discount_percent,
        price_source: purchase
            .price_source
            .clone()
            .unwrap_or_else(|| "list".to_owned()),
        total_amount: purchase.total_amount,
        commission: purchase.commission_amount,
        payout: purchase.payout_amount,
        direct_sale: purchase.direct_sale,
        sold_at: purchase.created_at,
    }
}

/// Items the bazaar took in at intake; they pay the fee whether they sell or not.
pub const ACCEPTED_STATUSES: &str = "('available', 'sold', 'returned')";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeFee {
    /// Fee per item in €
    pub per_item: Decimal,
    pub items: i64,
    /// Fee in € kept from the payout
    pub total: Decimal,
}

pub const NO_FEE: IntakeFee = IntakeFee {
    per_item: Decimal::ZERO,
    items: 0,
    total: Decimal::ZERO,
};

fn fee_for(per_item: Decimal, items: i64) -> IntakeFee {
    IntakeFee {
        per_item,
        items,
        total: (per_item * Decimal::from(items)).cents(),
    }
}

/// The fee as stored at payout, so later changes of the setting do not alter old settlements.
fn stored_fee(seller: Option<&EventSeller>) -> Option<IntakeFee> {
    let seller = seller.filter(|seller| seller.payout_received)?;
    let total = seller.intake_fee?;
    let items = i64::from(seller.intake_fee_items.unwrap_or(0));
    Some(IntakeFee {
        per_item: if items > 0 {
            total / Decimal::from(items)
        } else {
            Decimal::ZERO
        },
        items,
        total,
    })
}

/// Accepted items per seller of the event, for the event-wide views.
pub async fn accepted_items_by_seller(
    conn: &mut PgConnection,
    event_id: Uuid,
) -> sqlx::Result<HashMap<Uuid, i64>> {
    let rows: Vec<(Uuid, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT p.vendor_id, count(*) FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND ep.status IN {ACCEPTED_STATUSES}
         GROUP BY p.vendor_id"
    )))
    .bind(event_id)
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().collect())
}

/// Intake fee of one seller, given the accepted items (see accepted_items_by_seller).
pub fn intake_fee_of(
    event: &Event,
    seller: Option<&EventSeller>,
    accepted_items: i64,
) -> IntakeFee {
    if let Some(stored) = stored_fee(seller) {
        return stored;
    }
    match event.resolved_features().intake_fee {
        Some(per_item) if per_item > Decimal::ZERO => fee_for(per_item, accepted_items),
        _ => NO_FEE,
    }
}

/// Intake fee of one seller; counts only that seller's items.
pub async fn intake_fee_for_seller(
    conn: &mut PgConnection,
    event: &Event,
    seller_id: Uuid,
    seller: Option<&EventSeller>,
) -> sqlx::Result<IntakeFee> {
    if let Some(stored) = stored_fee(seller) {
        return Ok(stored);
    }
    let Some(per_item) = event
        .resolved_features()
        .intake_fee
        .filter(|fee| *fee > Decimal::ZERO)
    else {
        return Ok(NO_FEE);
    };
    let items: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT count(*) FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status IN {ACCEPTED_STATUSES}"
    )))
    .bind(event.id)
    .bind(seller_id)
    .fetch_one(conn)
    .await?;
    Ok(fee_for(per_item, items))
}

/// What the fee cap gives back of a seller's fees (commission and intake fee): everything
/// above it. The app computes the same (feeCapCredit, src/shared/feeCap.ts).
pub fn fee_cap_credit(fees: Decimal, cap: Option<Decimal>) -> Decimal {
    cap.map_or(Decimal::ZERO, |cap| (fees - cap).max(Decimal::ZERO))
}

/// The commission of a direct sale under the cap: at most what is left of it after the
/// commissions the seller `paid` before. The app shows the same (cappedCommission).
pub fn capped_commission(commission: Decimal, paid: Decimal, cap: Option<Decimal>) -> Decimal {
    cap.map_or(commission, |cap| {
        commission.min((cap - paid).max(Decimal::ZERO))
    })
}

/// The fee cap credit of one seller: as stored at the payout, otherwise from the setting.
pub fn fee_cap_credit_of(
    event: &Event,
    seller: Option<&EventSeller>,
    commission: Decimal,
    intake_fee: &IntakeFee,
) -> Decimal {
    if let Some(seller) = seller.filter(|seller| seller.payout_received) {
        return seller.fee_cap_credit.unwrap_or(Decimal::ZERO);
    }
    fee_cap_credit(
        commission + intake_fee.total,
        event.resolved_features().max_fees_per_seller,
    )
}

/// Commissions the seller paid at the desk for direct sales of the event so far.
pub async fn direct_commission_paid(
    conn: &mut PgConnection,
    event_id: Uuid,
    seller_id: Uuid,
) -> sqlx::Result<Decimal> {
    sqlx::query_scalar(
        "SELECT COALESCE(sum(commission_amount), 0) FROM purchases
         WHERE event_id = $1 AND seller_id = $2 AND direct_sale",
    )
    .bind(event_id)
    .bind(seller_id)
    .fetch_one(conn)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn euro(cents: i64) -> Decimal {
        Decimal::new(cents, 2)
    }

    #[test]
    fn the_cap_gives_back_what_is_above_it() {
        assert_eq!(fee_cap_credit(euro(3500), None), Decimal::ZERO);
        assert_eq!(fee_cap_credit(euro(1500), Some(euro(2000))), Decimal::ZERO);
        assert_eq!(fee_cap_credit(euro(2000), Some(euro(2000))), Decimal::ZERO);
        assert_eq!(fee_cap_credit(euro(3550), Some(euro(2000))), euro(1550));
        // A cap of 0 waives every fee
        assert_eq!(fee_cap_credit(euro(300), Some(Decimal::ZERO)), euro(300));
    }

    #[test]
    fn direct_sales_pay_commission_up_to_the_cap() {
        assert_eq!(capped_commission(euro(1400), euro(0), None), euro(1400));
        assert_eq!(
            capped_commission(euro(1400), euro(0), Some(euro(2000))),
            euro(1400)
        );
        assert_eq!(
            capped_commission(euro(1400), euro(1400), Some(euro(2000))),
            euro(600)
        );
        assert_eq!(
            capped_commission(euro(1400), euro(2000), Some(euro(2000))),
            Decimal::ZERO
        );
        // Paid more before the cap was lowered: nothing more, never a refund
        assert_eq!(
            capped_commission(euro(500), euro(2500), Some(euro(2000))),
            Decimal::ZERO
        );
    }

    #[test]
    fn capped_direct_sales_and_the_settlement_agree() {
        // Three direct sales of 14 € commission each, cap 20 €, intake fee 3 €
        let cap = Some(euro(2000));
        let mut paid = Decimal::ZERO;
        for _ in 0..3 {
            paid += capped_commission(euro(1400), paid, cap);
        }
        assert_eq!(paid, euro(2000));
        // The intake fee is waived at the payout: all fees stay at the cap
        assert_eq!(fee_cap_credit(paid + euro(300), cap), euro(300));
    }
}
