-- Fee cap (features.maxFeesPerSeller, #301): what a seller got back of their fees at the
-- payout because they were above the cap. Stored like the intake fee, so a later change of
-- the setting does not alter a settlement; NULL for payouts without a cap.
ALTER TABLE event_sellers ADD COLUMN fee_cap_credit numeric;
