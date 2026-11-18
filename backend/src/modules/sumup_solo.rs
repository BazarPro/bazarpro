//! The SumUp Solo over SumUp's Cloud API, for card payments at a cash desk without the
//! SumUp SDK: in the browser, e.g. on a PC at the cash desk (#155).
//!
//! The Solo is online itself (Wi-Fi or mobile data). The organizer pairs it once with their
//! SumUp account, which they connected with OAuth (modules::sumup): the Solo shows a code,
//! which goes to SumUp through `/api/sumup/readers/pair`. A desk of the team then sends the
//! cart's total to the Solo through the backend, and asks here until the payment is done.
//! The backend holds the organizer's token, so the desk never sees it.
//!
//! Everything here calls SumUp, so it is not a mutation: those run again on a conflict,
//! and a payment must not.

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use reqwest::{RequestBuilder, Response};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::sumup::{self, Access, Desk};
use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::shape::Id;

/// `/api/sumup/…`, next to the OAuth routes
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/readers", post(readers))
        .route("/readers/pair", post(pair))
        .route("/readers/remove", post(remove))
        .route("/checkout", post(checkout))
        .route("/checkout/status", post(checkout_status))
        .route("/checkout/cancel", post(cancel))
}

/// SumUp takes no card payment below 1 €
const MIN_AMOUNT_CENTS: i64 = 100;
/// A typo of the cashier, not a sale at a bazaar
const MAX_AMOUNT_CENTS: i64 = 1_000_000;
const MAX_NAME_LEN: usize = 60;

/// The desk's SumUp account and what the user may do with it
struct Solo {
    desk: Desk,
    access: Access,
    merchant: String,
}

impl Solo {
    async fn new(state: &AppState, user: Uuid, event: Uuid) -> AppResult<Self> {
        if state.config.sumup.is_none() {
            return Err(AppError::not_found("sumup.notConfigured"));
        }
        let desk = sumup::desk(state, user, event).await?;
        let access = sumup::access(state, desk.owner).await?;
        let merchant = sumup::require_merchant_code(state, desk.owner, &access).await?;
        Ok(Self {
            desk,
            access,
            merchant,
        })
    }

    /// Pairing and removing readers changes the organizer's SumUp account: theirs alone.
    fn require_owner(&self, user: Uuid) -> AppResult<()> {
        if self.desk.owner == user {
            Ok(())
        } else {
            Err(AppError::forbidden("sumup.organizerOnly"))
        }
    }

    fn readers_url(&self, state: &AppState, path: &str) -> String {
        format!(
            "{}/v0.1/merchants/{}/readers{path}",
            state.config.sumup_api_url,
            urlencoding::encode(&self.merchant)
        )
    }

    fn reader_url(&self, state: &AppState, reader: &str, path: &str) -> String {
        self.readers_url(state, &format!("/{}{path}", urlencoding::encode(reader)))
    }

    async fn send(&self, request: RequestBuilder) -> AppResult<Response> {
        request
            .bearer_auth(&self.access.access_token)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|err| {
                tracing::warn!(error = ?err, "SumUp did not answer");
                sumup::unreachable()
            })
    }
}

/// SumUp's IDs end up in paths of its API
fn plain_id(value: &str) -> AppResult<&str> {
    let plausible = !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if plausible {
        Ok(value)
    } else {
        Err(AppError::bad_request("sumup.readerNotFound"))
    }
}

/// SumUp's answer, or the error for the desk.
async fn read(response: Response) -> AppResult<Value> {
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    if status.is_success() {
        return Ok(body);
    }
    Err(refused(status, &body))
}

fn refused(status: StatusCode, body: &Value) -> AppError {
    let kind = body["errors"]["type"].as_str().unwrap_or_default();
    match (status, kind) {
        (_, "READER_OFFLINE") => AppError::coded(status, "sumup.readerOffline", &[]),
        (_, "READER_BUSY") => AppError::coded(status, "sumup.readerBusy", &[]),
        // The token lacks the readers scopes: connected before BazarPro asked for them
        (StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN, _) => {
            tracing::warn!(%status, %body, "SumUp denied the readers API");
            AppError::forbidden("sumup.reconnect")
        }
        (StatusCode::NOT_FOUND, _) => AppError::not_found("sumup.readerNotFound"),
        (status, _) if status.is_server_error() => {
            tracing::warn!(%status, %body, "SumUp failed");
            sumup::unreachable()
        }
        _ => {
            tracing::warn!(%status, %body, "SumUp refused a request");
            AppError::coded(StatusCode::UNPROCESSABLE_ENTITY, "sumup.refused", &[])
        }
    }
}

// --- readers

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReaderView {
    id: String,
    name: String,
    /// `solo` or `virtual-solo` (SumUp's sandbox)
    model: Option<String>,
    /// `paired`; `processing` while the Solo has not confirmed the code yet
    status: String,
    /// Whether the Solo is online; none when SumUp did not say
    online: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadersView {
    readers: Vec<ReaderView>,
    /// The signed-in user is the organizer, who pairs and removes readers
    may_pair: bool,
}

fn reader_view(reader: &Value) -> Option<ReaderView> {
    Some(ReaderView {
        id: reader["id"].as_str()?.to_owned(),
        name: reader["name"].as_str().unwrap_or_default().to_owned(),
        model: reader["device"]["model"].as_str().map(str::to_owned),
        status: reader["status"].as_str().unwrap_or("unknown").to_owned(),
        online: None,
    })
}

/// The Solos of the organizer's account, with whether each is online.
async fn readers(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<EventArgs>,
) -> AppResult<Json<ReadersView>> {
    let solo = Solo::new(&state, current.user_id, args.event_id.0).await?;
    let body = read(
        solo.send(state.http.get(solo.readers_url(&state, "")))
            .await?,
    )
    .await?;
    let mut readers: Vec<ReaderView> = body["items"]
        .as_array()
        .map(|items| items.iter().filter_map(reader_view).collect())
        .unwrap_or_default();
    // An expired code is no reader; its pairing has to start again
    readers.retain(|reader| reader.status == "paired" || reader.status == "processing");
    let online = futures::future::join_all(readers.iter().map(|reader| async {
        if reader.status != "paired" {
            return None;
        }
        let response = solo
            .send(
                state
                    .http
                    .get(solo.reader_url(&state, &reader.id, "/status")),
            )
            .await
            .ok()?;
        let body = read(response).await.ok()?;
        Some(body["data"]["status"].as_str()? == "ONLINE")
    }))
    .await;
    for (reader, online) in readers.iter_mut().zip(online) {
        reader.online = online;
    }
    Ok(Json(ReadersView {
        may_pair: solo.desk.owner == current.user_id,
        readers,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PairArgs {
    event_id: Id,
    /// Shown on the Solo under Connections → API → Connect; valid for five minutes
    pairing_code: String,
    name: Option<String>,
}

/// Pairs a Solo with the organizer's account.
async fn pair(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<PairArgs>,
) -> AppResult<Json<ReaderView>> {
    let code: String = args
        .pairing_code
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase();
    if !(8..=9).contains(&code.len()) || !code.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::bad_request("sumup.pairingCode"));
    }
    let name = args
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("Solo")
        .chars()
        .take(MAX_NAME_LEN)
        .collect::<String>();
    let solo = Solo::new(&state, current.user_id, args.event_id.0).await?;
    solo.require_owner(current.user_id)?;
    let response = solo
        .send(
            state
                .http
                .post(solo.readers_url(&state, ""))
                .json(&json!({ "pairing_code": code, "name": name })),
        )
        .await?;
    // A wrong or expired code, or a Solo that is logged in or paired elsewhere
    if matches!(
        response.status(),
        StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND | StatusCode::CONFLICT
    ) {
        let status = response.status();
        let body: Value = response.json().await.unwrap_or(Value::Null);
        // Kept at warn: SumUp's reason is the only hint why a Solo does not pair
        tracing::warn!(%status, %body, "SumUp refused a pairing code");
        return Err(AppError::bad_request("sumup.pairingFailed"));
    }
    let body = read(response).await?;
    reader_view(&body).map(Json).ok_or_else(sumup::unreachable)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReaderArgs {
    event_id: Id,
    reader_id: String,
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

/// Unpairs a Solo from the organizer's account. On the Solo itself the connection is ended
/// in its menu.
async fn remove(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<ReaderArgs>,
) -> AppResult<Json<Success>> {
    let reader = plain_id(&args.reader_id)?;
    let solo = Solo::new(&state, current.user_id, args.event_id.0).await?;
    solo.require_owner(current.user_id)?;
    let response = solo
        .send(state.http.delete(solo.reader_url(&state, reader, "")))
        .await?;
    // Gone already is what was asked for
    if response.status() != StatusCode::NOT_FOUND {
        read(response).await?;
    }
    Ok(Json(Success { success: true }))
}

// --- payments

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CheckoutArgs {
    event_id: Id,
    reader_id: String,
    /// The cart's total in cents
    amount_cents: i64,
    /// The desk sale it pays for; SumUp's foreign transaction ID, to find the payment
    desk_sale_id: Uuid,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutView {
    /// To ask for the outcome; SumUp may leave it out
    checkout_id: Option<String>,
    /// SumUp's ID of the transaction, also when there is no checkout ID
    client_transaction_id: String,
}

/// Sends the total to the Solo, which asks for the card. The answer comes before the card
/// is charged; the desk asks `/checkout/status` for the outcome.
async fn checkout(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<CheckoutArgs>,
) -> AppResult<Json<CheckoutView>> {
    let reader = plain_id(&args.reader_id)?;
    if !(MIN_AMOUNT_CENTS..=MAX_AMOUNT_CENTS).contains(&args.amount_cents) {
        return Err(AppError::bad_request("sumup.amount"));
    }
    let solo = Solo::new(&state, current.user_id, args.event_id.0).await?;
    let mut request = json!({
        "total_amount": { "value": args.amount_cents, "currency": "EUR", "minor_unit": 2 },
        "description": solo.desk.title.chars().take(MAX_NAME_LEN).collect::<String>(),
    });
    if let Some(affiliate) = &state.config.sumup_affiliate {
        request["affiliate"] = json!({
            "app_id": affiliate.app_id,
            "key": affiliate.key,
            "foreign_transaction_id": args.desk_sale_id.to_string(),
        });
    }
    let response = solo
        .send(
            state
                .http
                .post(solo.reader_url(&state, reader, "/checkout"))
                .json(&request),
        )
        .await?;
    let body = read(response).await?;
    let data = &body["data"];
    let client_transaction_id = data["client_transaction_id"]
        .as_str()
        .ok_or_else(sumup::unreachable)?
        .to_owned();
    Ok(Json(CheckoutView {
        checkout_id: data["checkout_id"].as_str().map(str::to_owned),
        client_transaction_id,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StatusArgs {
    event_id: Id,
    reader_id: String,
    checkout_id: Option<String>,
    client_transaction_id: String,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusView {
    /// pending, successful, failed or cancelled
    status: &'static str,
    /// SumUp's transaction code, to find the payment in SumUp
    transaction_code: Option<String>,
    card_type: Option<String>,
    last_four: Option<String>,
}

/// Where a payment on the Solo stands: by its checkout, and SumUp's transaction for the
/// code of a payment that went through.
async fn checkout_status(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<StatusArgs>,
) -> AppResult<Json<StatusView>> {
    let reader = plain_id(&args.reader_id)?;
    let transaction_id = plain_id(&args.client_transaction_id)?;
    let solo = Solo::new(&state, current.user_id, args.event_id.0).await?;

    let mut status = None;
    if let Some(checkout) = args.checkout_id.as_deref() {
        let checkout = plain_id(checkout)?;
        let response = solo
            .send(state.http.get(solo.reader_url(
                &state,
                reader,
                &format!("/checkout/{}", urlencoding::encode(checkout)),
            )))
            .await?;
        // Not known by its checkout: then by the transaction
        if response.status() != StatusCode::NOT_FOUND {
            let body = read(response).await?;
            status = Some(match body["data"]["status"].as_str() {
                Some("successful") => "successful",
                Some("failed") => "failed",
                Some("cancelled") => "cancelled",
                _ => "pending",
            });
            if status != Some("successful") {
                return Ok(Json(StatusView {
                    status: status.unwrap_or("pending"),
                    transaction_code: None,
                    card_type: None,
                    last_four: None,
                }));
            }
        }
    }

    let transaction = transaction(&state, &solo, transaction_id).await;
    let view = match (status, transaction) {
        (_, Ok(Some(transaction))) => {
            let from_transaction = match transaction["status"].as_str() {
                Some("SUCCESSFUL") => "successful",
                Some("FAILED") => "failed",
                Some("CANCELLED") => "cancelled",
                _ => "pending",
            };
            StatusView {
                // The checkout's word counts; the transaction may lag behind
                status: status.unwrap_or(from_transaction),
                transaction_code: transaction["transaction_code"].as_str().map(str::to_owned),
                card_type: transaction["card"]["type"].as_str().map(str::to_owned),
                last_four: transaction["card"]["last_4_digits"]
                    .as_str()
                    .map(str::to_owned),
            }
        }
        // Paid, but the transaction is not there yet or may not be read: without its code
        (Some(status), _) => StatusView {
            status,
            transaction_code: None,
            card_type: None,
            last_four: None,
        },
        // No transaction yet: the Solo still waits for the card
        (None, Ok(None)) => StatusView {
            status: "pending",
            transaction_code: None,
            card_type: None,
            last_four: None,
        },
        (None, Err(err)) => return Err(err),
    };
    Ok(Json(view))
}

/// SumUp's transaction of a payment on the Solo; None while there is none.
async fn transaction(state: &AppState, solo: &Solo, id: &str) -> AppResult<Option<Value>> {
    let response = solo
        .send(state.http.get(format!(
            "{}/v2.1/merchants/{}/transactions?client_transaction_id={}",
            state.config.sumup_api_url,
            urlencoding::encode(&solo.merchant),
            urlencoding::encode(id)
        )))
        .await?;
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    read(response).await.map(Some)
}

/// Stops the payment on the Solo while it waits for the card or the PIN. The desk then
/// sees it as failed by its status.
async fn cancel(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<ReaderArgs>,
) -> AppResult<Json<Success>> {
    let reader = plain_id(&args.reader_id)?;
    let solo = Solo::new(&state, current.user_id, args.event_id.0).await?;
    let response = solo
        .send(
            state
                .http
                .post(solo.reader_url(&state, reader, "/terminate")),
        )
        .await?;
    read(response).await?;
    Ok(Json(Success { success: true }))
}
