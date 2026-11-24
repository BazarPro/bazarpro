-- Admins keep the services organizers offer at their bazaars (#256), instead of a fixed enum
CREATE TABLE event_services (
  name text PRIMARY KEY,
  name_en text,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO event_services (name, name_en, position) VALUES
  ('Parkplatz', 'Parking', 1),
  ('Skiservice', 'Ski service', 2),
  ('Fahrradcodierung', 'Bike coding', 3),
  ('Gastronomie', 'Restaurant', 4),
  ('Imbiss', 'Snacks', 5),
  ('Getränke', 'Drinks', 6);

ALTER TABLE events ALTER COLUMN services DROP DEFAULT;
ALTER TABLE events ALTER COLUMN services TYPE text[] USING services::text[];
ALTER TABLE events ALTER COLUMN services SET DEFAULT '{}';
DROP TYPE event_service;
