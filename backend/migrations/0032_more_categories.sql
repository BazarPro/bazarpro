-- More categories for bike sales and children's bazaars (#300), same as DEFAULT_CATEGORIES
-- in src/modules/categories.rs. Only for instances that use the default categories: an
-- instance with its own list keeps it, and an empty one gets all of them when seeded.
INSERT INTO categories (label, translations)
SELECT d.de, jsonb_build_object('en', d.en)
FROM (VALUES
  ('Kinderfahrräder', 'Children''s bikes'),
  ('Laufräder', 'Balance bikes'),
  ('Roller & Scooter', 'Scooters'),
  ('Einräder', 'Unicycles'),
  ('Bobbycars & Rutschfahrzeuge', 'Ride-on toys'),
  ('Lastenräder', 'Cargo bikes'),
  ('E-Bikes & Pedelecs', 'E-bikes'),
  ('Fahrradanhänger', 'Bike trailers'),
  ('Fahrrad-Kindersitze', 'Child bike seats'),
  ('Fahrradzubehör', 'Bike accessories')
) AS d (de, en)
WHERE EXISTS (SELECT 1 FROM categories WHERE label = 'Fahrräder')
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE lower(c.label) = lower(d.de));
