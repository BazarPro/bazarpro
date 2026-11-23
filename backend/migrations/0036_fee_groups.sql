-- Fee groups (features.feeGroups, #302): the group a seller is in, by their own choice
-- (self-declared) or put in by the team. Helpers are in their group by role and need no row.
-- fee_group_decided_at/by: when the team confirmed, assigned or took away the group; a
-- self-declared group without it is still to be checked at the intake.
-- fee_group_label: the group applied at the payout, so the settlement keeps it.
ALTER TABLE event_sellers
  ADD COLUMN fee_group_id text,
  ADD COLUMN fee_group_decided_at timestamptz,
  ADD COLUMN fee_group_decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN fee_group_label text;
