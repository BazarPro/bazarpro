-- The commission percent applied at the payout (#302), next to fee_group_label: so the
-- settlement keeps showing the rate it was booked with, even when the group or the bazaar's
-- commission changes later. NULL for payouts from before.
ALTER TABLE event_sellers ADD COLUMN commission_percent numeric;
