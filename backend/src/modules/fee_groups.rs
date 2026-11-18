//! Fee groups (#302): sellers with own fees instead of the bazaar's, e.g. club members or
//! helpers. A seller is in at most one group at a time; who would be in several gets the
//! cheapest. Self-declared groups are checked by the team at the intake: until then no
//! item of the seller can be accepted, so nobody is settled with a group nobody checked.

use std::cmp::Ordering;
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::docs::{self, Event};
use super::event_roles::{self, Permission, Role, assert_vendor_not_paid_out, require_permission};
use super::features::{FeeGroup, FeeGroupAssignment};
use super::sales::{self, ACCEPTED_STATUSES};
use crate::error::{AppError, AppResult};
use crate::money::Cents;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms_opt};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "feeGroups.getMyFeeGroup" => get_my_fee_group);
    register!(registry, Mutation "feeGroups.chooseFeeGroup" => choose_fee_group);
    register!(registry, Mutation "feeGroups.confirmFeeGroup" => confirm_fee_group);
    register!(registry, Mutation "feeGroups.removeFeeGroup" => remove_fee_group);
    register!(registry, Mutation "feeGroups.assignFeeGroup" => assign_fee_group);
}

/// The fees one seller pays at the bazaar: the bazaar's or those of their group.
#[derive(Debug, Clone, PartialEq)]
pub struct SellerFees {
    /// The group whose fees apply; none: the bazaar's
    pub group: Option<FeeGroup>,
    /// Percent of each sale
    pub commission: Decimal,
    /// € per accepted item
    pub intake_fee: Option<Decimal>,
    /// All fees of the seller together at most
    pub max_fees_per_seller: Option<Decimal>,
    pub max_items_per_seller: Option<u32>,
}

impl SellerFees {
    /// The bazaar's own fees
    pub fn of_event(event: &Event) -> Self {
        let features = event.resolved_features();
        Self {
            group: None,
            commission: event.commission,
            intake_fee: features.intake_fee.filter(|fee| *fee > Decimal::ZERO),
            max_fees_per_seller: features.max_fees_per_seller,
            max_items_per_seller: features.max_items_per_seller,
        }
    }

    /// The fees of a group: cap and item limit fall back to the bazaar's
    pub fn of_group(event: &Event, group: &FeeGroup) -> Self {
        let base = Self::of_event(event);
        Self {
            group: Some(group.clone()),
            commission: group.commission,
            intake_fee: group.intake_fee.filter(|fee| *fee > Decimal::ZERO),
            max_fees_per_seller: group.max_fees_per_seller.or(base.max_fees_per_seller),
            max_items_per_seller: group.max_items_per_seller.or(base.max_items_per_seller),
        }
    }

    /// The commission of a sale at `total`, in cents
    pub fn commission_of(&self, total: Decimal) -> Option<Decimal> {
        total
            .checked_mul(self.commission)
            .map(|c| (c / Decimal::ONE_HUNDRED).cents())
    }
}

/// Which of two fee sets is cheaper for the seller: the lower commission, then the lower
/// intake fee, then the lower cap. The app sorts the same (cheaperFees in feeGroups.ts).
fn compare(a: &SellerFees, b: &SellerFees) -> Ordering {
    let key = |f: &SellerFees| {
        (
            f.commission,
            f.intake_fee.unwrap_or_default(),
            f.max_fees_per_seller.unwrap_or(Decimal::MAX),
        )
    };
    key(a).cmp(&key(b))
}

/// The fees of a seller in the stored group `stored` (if it still exists) and, as helper,
/// in every helper group: the cheapest of them; the bazaar's without any.
pub fn fees_for(event: &Event, stored: Option<&str>, helper: bool) -> SellerFees {
    let groups = event.resolved_features().fee_groups;
    groups
        .iter()
        .filter(|group| {
            Some(group.id.as_str()) == stored
                || (helper && group.assignment == FeeGroupAssignment::Helpers)
        })
        .map(|group| SellerFees::of_group(event, group))
        .min_by(compare)
        .unwrap_or_else(|| SellerFees::of_event(event))
}

/// What the event needs to know of a seller for their group.
#[derive(Debug, Clone, Default)]
pub struct Membership {
    pub stored: Option<String>,
    pub decided_at: Option<DateTime<Utc>>,
    pub helper: bool,
}

impl Membership {
    fn from_row(row: Option<&docs::EventSeller>, helper: bool) -> Self {
        Self {
            stored: row.and_then(|row| row.fee_group_id.clone()),
            decided_at: row.and_then(|row| row.fee_group_decided_at),
            helper,
        }
    }

    pub fn fees(&self, event: &Event) -> SellerFees {
        fees_for(event, self.stored.as_deref(), self.helper)
    }

    /// A self-declared group the team has not checked yet, and it is the one that applies
    pub fn pending<'a>(&self, event: &Event, fees: &'a SellerFees) -> Option<&'a FeeGroup> {
        fees.group.as_ref().filter(|group| {
            self.decided_at.is_none()
                && group.assignment == FeeGroupAssignment::SelfDeclared
                && self.stored.as_deref() == Some(group.id.as_str())
                && !event.resolved_features().fee_groups.is_empty()
        })
    }
}

async fn is_helper(conn: &mut PgConnection, event: Uuid, seller: Uuid) -> sqlx::Result<bool> {
    event_roles::has_role(conn, event, seller, Role::Coorganizer).await
}

/// The group of one seller.
pub async fn membership(
    conn: &mut PgConnection,
    event: &Event,
    seller: Uuid,
) -> sqlx::Result<Membership> {
    if event.resolved_features().fee_groups.is_empty() {
        return Ok(Membership::default());
    }
    let row = docs::event_seller(&mut *conn, event.id, seller).await?;
    let helper = is_helper(conn, event.id, seller).await?;
    Ok(Membership::from_row(row.as_ref(), helper))
}

/// The fees one seller pays at the event.
pub async fn seller_fees(
    conn: &mut PgConnection,
    event: &Event,
    seller: Uuid,
) -> sqlx::Result<SellerFees> {
    if event.resolved_features().fee_groups.is_empty() {
        return Ok(SellerFees::of_event(event));
    }
    Ok(membership(conn, event, seller).await?.fees(event))
}

/// The fees of every seller of the event, for the cash desk and the lists. Sellers without
/// a group pay the bazaar's.
pub struct FeeBook {
    default: SellerFees,
    by_seller: HashMap<Uuid, SellerFees>,
}

impl FeeBook {
    pub async fn load(conn: &mut PgConnection, event: &Event) -> sqlx::Result<Self> {
        let default = SellerFees::of_event(event);
        let mut by_seller = HashMap::new();
        if !event.resolved_features().fee_groups.is_empty() {
            let rows: Vec<(Uuid, Option<String>, bool)> = sqlx::query_as(
                "SELECT u.user_id, s.fee_group_id, bool_or(u.helper) FROM (
                   SELECT user_id, false AS helper FROM event_sellers
                   WHERE event_id = $1 AND fee_group_id IS NOT NULL
                   UNION ALL SELECT user_id, true FROM event_roles
                   WHERE event_id = $1 AND role = 'coorganizer'
                 ) u
                 LEFT JOIN event_sellers s ON s.event_id = $1 AND s.user_id = u.user_id
                 GROUP BY u.user_id, s.fee_group_id",
            )
            .bind(event.id)
            .fetch_all(conn)
            .await?;
            for (seller, stored, helper) in rows {
                by_seller.insert(seller, fees_for(event, stored.as_deref(), helper));
            }
        }
        Ok(Self { default, by_seller })
    }

    pub fn get(&self, seller: Uuid) -> &SellerFees {
        self.by_seller.get(&seller).unwrap_or(&self.default)
    }
}

/// Refuses the intake of a seller whose self-declared group the team has not checked:
/// confirming or taking it away comes first.
pub async fn assert_group_decided(
    conn: &mut PgConnection,
    event: &Event,
    seller: Uuid,
) -> AppResult<()> {
    let member = membership(conn, event, seller).await?;
    let fees = member.fees(event);
    if let Some(group) = member.pending(event, &fees) {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "feeGroup.unconfirmed",
            &[("group", &group.label)],
        ));
    }
    Ok(())
}

/// Books the seller's sales of the event anew with the fees that apply now, after their
/// group changed. Sales through the desk: commission of the price, the rest is paid out.
/// Direct sales: the desk took what it took, so what the seller paid too much comes back
/// with the payout and what is missing is owed (a negative payout of that sale); the cap
/// applies in booking order. Not for paid-out sellers: the settlement is final.
pub async fn reprice_seller_sales(
    conn: &mut PgConnection,
    event: &Event,
    seller: Uuid,
) -> sqlx::Result<()> {
    let fees = seller_fees(&mut *conn, event, seller).await?;
    let rows: Vec<(Uuid, Decimal, Decimal, Decimal, bool)> = sqlx::query_as(
        "SELECT id, total_amount, commission_amount, payout_amount, direct_sale FROM purchases
         WHERE event_id = $1 AND seller_id = $2 ORDER BY created_at, id",
    )
    .bind(event.id)
    .bind(seller)
    .fetch_all(&mut *conn)
    .await?;
    let mut paid_directly = Decimal::ZERO;
    for (id, total, commission, payout, direct) in rows {
        let full = fees.commission_of(total).unwrap_or(commission);
        let (due, rest) = if direct {
            let due = sales::capped_commission(full, paid_directly, fees.max_fees_per_seller);
            paid_directly += due;
            // What the desk took stays: commission + payout
            (due, commission + payout - due)
        } else {
            (full, total - full)
        };
        if due != commission {
            sqlx::query(
                "UPDATE purchases SET commission_amount = $2, payout_amount = $3 WHERE id = $1",
            )
            .bind(id)
            .bind(due)
            .bind(rest)
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(())
}

/// After a helper role came or went: the seller's group may be another now.
pub async fn after_role_change(ctx: &mut Ctx, event: Uuid, seller: Uuid) -> AppResult<()> {
    let Some(event) = docs::event(ctx.conn(), event).await? else {
        return Ok(());
    };
    let helper_groups = event
        .resolved_features()
        .fee_groups
        .iter()
        .any(|group| group.assignment == FeeGroupAssignment::Helpers);
    let paid = docs::event_seller(ctx.conn(), event.id, seller)
        .await?
        .is_some_and(|row| row.payout_received);
    if helper_groups && !paid {
        sales::lock_seller_fees(ctx.conn(), event.id, seller).await?;
        reprice_seller_sales(ctx.conn(), &event, seller).await?;
    }
    Ok(())
}

/// Whether the team took in an item of the seller already: then the seller can no longer
/// change their group themselves.
async fn has_accepted_items(
    conn: &mut PgConnection,
    event: Uuid,
    seller: Uuid,
) -> sqlx::Result<bool> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status IN {ACCEPTED_STATUSES})"
    )))
    .bind(event)
    .bind(seller)
    .fetch_one(conn)
    .await
}

/// A group sellers may choose themselves; `None` (no group) is always fine.
pub fn check_choice(event: &Event, group: Option<&str>) -> AppResult<()> {
    let Some(group) = group else {
        return Ok(());
    };
    let choosable = event
        .resolved_features()
        .fee_groups
        .iter()
        .any(|g| g.id == group && g.assignment == FeeGroupAssignment::SelfDeclared);
    if !choosable {
        return Err(AppError::bad_request("feeGroup.unknown"));
    }
    Ok(())
}

async fn event_of(ctx: &mut Ctx, event: Uuid) -> AppResult<Event> {
    docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

/// The seller's group as they see it.
#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MyFeeGroup {
    /// The group the seller chose or was put in
    chosen: Option<String>,
    /// The group whose fees apply: the chosen one or, as helper, a helper group
    applied: Option<String>,
    /// The chosen group is still to be checked at the intake
    pending: bool,
    /// The team decided on the group: confirmed, put in or taken away
    #[serde(with = "ms_opt")]
    decided_at: Option<DateTime<Utc>>,
    /// The seller can no longer change it (first item accepted, or the team decided)
    locked: bool,
}

async fn get_my_fee_group(ctx: &mut Ctx, args: EventArgs) -> AppResult<Option<MyFeeGroup>> {
    let Some(user) = ctx.user else {
        return Ok(None);
    };
    let event_id = args.event_id.0;
    ctx.read(Topic::Event(event_id));
    ctx.read(Topic::User(user));
    let Some(event) = docs::event(ctx.conn(), event_id).await? else {
        return Ok(None);
    };
    if event.resolved_features().fee_groups.is_empty()
        || !event_roles::has_role(ctx.conn(), event_id, user, Role::Seller).await?
    {
        return Ok(None);
    }
    let member = membership(ctx.conn(), &event, user).await?;
    let fees = member.fees(&event);
    let pending = member.pending(&event, &fees).is_some();
    let locked = member.decided_at.is_some()
        || has_accepted_items(ctx.conn(), event_id, user).await?
        || event.end_date < Utc::now();
    Ok(Some(MyFeeGroup {
        applied: fees.group.map(|group| group.id),
        chosen: member.stored,
        pending,
        decided_at: member.decided_at,
        locked,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChooseArgs {
    event_id: Id,
    /// None: no group
    group_id: Option<String>,
}

/// The seller chooses a self-declared group, or none, until the first item is accepted.
async fn choose_fee_group(ctx: &mut Ctx, args: ChooseArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let event = event_of(ctx, args.event_id.0).await?;
    if !event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await? {
        return Err(AppError::bad_request("seller.notParticipant"));
    }
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("join.past"));
    }
    check_choice(&event, args.group_id.as_deref())?;
    let row = docs::event_seller(ctx.conn(), event.id, user).await?;
    if row
        .as_ref()
        .is_some_and(|row| row.fee_group_decided_at.is_some())
    {
        return Err(AppError::bad_request("feeGroup.decided"));
    }
    if has_accepted_items(ctx.conn(), event.id, user).await? {
        return Err(AppError::bad_request("feeGroup.locked"));
    }
    sqlx::query("UPDATE event_sellers SET fee_group_id = $3 WHERE event_id = $1 AND user_id = $2")
        .bind(event.id)
        .bind(user)
        .bind(args.group_id)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::User(user));
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SellerArgs {
    event_id: Id,
    seller_id: Id,
}

/// Stores the team's decision on the seller's group and books their sales anew.
async fn decide(
    ctx: &mut Ctx,
    event: &Event,
    seller: Uuid,
    by: Uuid,
    group: Option<Option<String>>,
) -> AppResult<()> {
    assert_vendor_not_paid_out(ctx.conn(), event.id, seller).await?;
    if docs::event_seller(ctx.conn(), event.id, seller)
        .await?
        .is_none()
    {
        return Err(AppError::bad_request("seller.notSeller"));
    }
    sales::lock_seller_fees(ctx.conn(), event.id, seller).await?;
    sqlx::query(
        "UPDATE event_sellers SET fee_group_id = CASE WHEN $3 THEN $4 ELSE fee_group_id END,
           fee_group_decided_at = now(), fee_group_decided_by = $5
         WHERE event_id = $1 AND user_id = $2",
    )
    .bind(event.id)
    .bind(seller)
    .bind(group.is_some())
    .bind(group.flatten())
    .bind(by)
    .execute(ctx.conn())
    .await?;
    reprice_seller_sales(ctx.conn(), event, seller).await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::User(seller));
    Ok(())
}

/// The team saw the proof (e.g. the member card) at the intake. Helpers with the intake
/// right may do it.
async fn confirm_fee_group(ctx: &mut Ctx, args: SellerArgs) -> AppResult<()> {
    let (event_id, seller) = (args.event_id.0, args.seller_id.0);
    let by = require_permission(ctx, event_id, Permission::Intake).await?;
    let event = event_of(ctx, event_id).await?;
    let stored = docs::event_seller(ctx.conn(), event_id, seller)
        .await?
        .and_then(|row| row.fee_group_id);
    let exists = event
        .resolved_features()
        .fee_groups
        .iter()
        .any(|group| Some(&group.id) == stored.as_ref());
    if !exists {
        return Err(AppError::bad_request("feeGroup.none"));
    }
    decide(ctx, &event, seller, by, None).await
}

/// The proof is missing: the seller pays the bazaar's fees (or a helper group's).
async fn remove_fee_group(ctx: &mut Ctx, args: SellerArgs) -> AppResult<()> {
    let (event_id, seller) = (args.event_id.0, args.seller_id.0);
    let by = require_permission(ctx, event_id, Permission::Intake).await?;
    let event = event_of(ctx, event_id).await?;
    decide(ctx, &event, seller, by, Some(None)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AssignArgs {
    event_id: Id,
    seller_id: Id,
    /// None: no group
    group_id: Option<String>,
}

/// The organizer puts a seller in a group by hand, e.g. a helper without rights in the
/// helper group. Changes money, so organizers only.
async fn assign_fee_group(ctx: &mut Ctx, args: AssignArgs) -> AppResult<()> {
    let (event_id, seller) = (args.event_id.0, args.seller_id.0);
    let by = ctx.require_user()?;
    if !event_roles::has_role_or_admin(ctx.conn(), event_id, by, Role::Organizer).await? {
        return Err(AppError::forbidden("feeGroup.organizerOnly"));
    }
    let event = event_of(ctx, event_id).await?;
    if let Some(group) = &args.group_id
        && !event
            .resolved_features()
            .fee_groups
            .iter()
            .any(|g| &g.id == group)
    {
        return Err(AppError::bad_request("feeGroup.unknown"));
    }
    decide(ctx, &event, seller, by, Some(args.group_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(features: serde_json::Value) -> Event {
        let mut event: Event = crate::modules::features::tests_event(features);
        event.commission = Decimal::new(10, 0);
        event
    }

    fn groups() -> serde_json::Value {
        json!({
            "intakeFee": 1.0,
            "maxFeesPerSeller": 20.0,
            "maxItemsPerSeller": 20,
            "feeGroups": [
                { "id": "members", "label": "Mitglieder", "commission": 5,
                  "assignment": "selfDeclared", "proofHint": "Ausweis zeigen" },
                { "id": "helpers", "label": "Helfer", "commission": 0, "intakeFee": 0.5,
                  "maxItemsPerSeller": 40, "assignment": "helpers" }
            ]
        })
    }

    #[test]
    fn sellers_without_a_group_pay_the_bazaars_fees() {
        let event = event(groups());
        let fees = fees_for(&event, None, false);
        assert_eq!(fees.group, None);
        assert_eq!(fees.commission, Decimal::new(10, 0));
        assert_eq!(fees.intake_fee, Some(Decimal::new(100, 2)));
        // A group that is gone counts as none
        assert_eq!(fees_for(&event, Some("gone"), false).group, None);
    }

    #[test]
    fn a_group_has_its_own_fees_and_falls_back_to_the_bazaars_cap_and_limit() {
        let event = event(groups());
        let members = fees_for(&event, Some("members"), false);
        assert_eq!(members.commission, Decimal::new(5, 0));
        // No intake fee in the group: none
        assert_eq!(members.intake_fee, None);
        assert_eq!(members.max_fees_per_seller, Some(Decimal::new(2000, 2)));
        assert_eq!(members.max_items_per_seller, Some(20));
        let helpers = fees_for(&event, None, true);
        assert_eq!(helpers.group.map(|g| g.id), Some("helpers".to_owned()));
        assert_eq!(helpers.max_items_per_seller, Some(40));
    }

    #[test]
    fn who_is_in_two_groups_gets_the_cheapest() {
        let event = event(groups());
        let fees = fees_for(&event, Some("members"), true);
        assert_eq!(fees.group.map(|g| g.id), Some("helpers".to_owned()));
    }

    #[test]
    fn only_an_unchecked_self_declaration_is_pending() {
        let event = event(groups());
        let mut member = Membership {
            stored: Some("members".to_owned()),
            decided_at: None,
            helper: false,
        };
        let fees = member.fees(&event);
        assert!(member.pending(&event, &fees).is_some());
        // As helper the helper group applies, nothing to check
        member.helper = true;
        let fees = member.fees(&event);
        assert!(member.pending(&event, &fees).is_none());
        member.helper = false;
        member.decided_at = Some(Utc::now());
        let fees = member.fees(&event);
        assert!(member.pending(&event, &fees).is_none());
    }

    #[test]
    fn commission_in_cents() {
        let event = event(groups());
        let fees = fees_for(&event, Some("members"), false);
        assert_eq!(
            fees.commission_of(Decimal::new(1999, 2)),
            Some(Decimal::new(100, 2))
        );
    }
}
