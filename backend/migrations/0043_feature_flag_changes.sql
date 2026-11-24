-- Admins switch feature flags in the admin area (#256): who changed a flag last and when
ALTER TABLE feature_flags ADD COLUMN updated_at timestamptz;
ALTER TABLE feature_flags ADD COLUMN updated_by uuid REFERENCES users (id) ON DELETE SET NULL;
