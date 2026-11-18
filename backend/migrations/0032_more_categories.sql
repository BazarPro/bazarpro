-- Categories for bike sales and children's bazaars (#300), grouped under main categories so
-- the lists stay short. Same tree and order as DEFAULT_CATEGORIES in src/modules/categories.rs.
-- Only for instances that use the default categories: an instance with its own list keeps
-- it, and an empty one gets the whole tree when it is seeded.
CREATE TEMPORARY TABLE default_categories (n int, de text, en text, parent text, added bool) ON COMMIT DROP;
INSERT INTO default_categories VALUES
  (0, 'Kleidung', 'Clothing', NULL, false),
  (1, 'Schuhe', 'Shoes', NULL, false),
  (2, 'Sport', 'Sports', NULL, false),
  (3, 'Fahrräder', 'Bikes', NULL, false),
  (4, 'Kinderfahrräder', 'Children''s bikes', 'Fahrräder', true),
  (5, 'Lastenräder', 'Cargo bikes', 'Fahrräder', true),
  (6, 'E-Bikes & Pedelecs', 'E-bikes', 'Fahrräder', true),
  (7, 'Fahrradanhänger', 'Bike trailers', 'Fahrräder', true),
  (8, 'Fahrrad-Kindersitze', 'Child bike seats', 'Fahrräder', true),
  (9, 'Fahrradzubehör', 'Bike accessories', 'Fahrräder', true),
  (10, 'Kinderfahrzeuge', 'Children''s vehicles', NULL, true),
  (11, 'Laufräder', 'Balance bikes', 'Kinderfahrzeuge', true),
  (12, 'Roller & Scooter', 'Scooters', 'Kinderfahrzeuge', true),
  (13, 'Einräder', 'Unicycles', 'Kinderfahrzeuge', true),
  (14, 'Bobbycars & Rutschfahrzeuge', 'Ride-on toys', 'Kinderfahrzeuge', true),
  (15, 'Elektronik', 'Electronics', NULL, false),
  (16, 'Bücher', 'Books', NULL, false),
  (17, 'Spielzeug', 'Toys', NULL, false),
  (18, 'Möbel', 'Furniture', NULL, false),
  (19, 'Haushalt', 'Household', NULL, false),
  (20, 'Accessoires', 'Accessories', NULL, false),
  (21, 'Sonstiges', 'Other', NULL, false);

-- Only the added ones: a default category an admin deleted stays deleted
INSERT INTO categories (label, translations)
SELECT d.de, jsonb_build_object('en', d.en)
FROM default_categories d
WHERE d.added
  AND EXISTS (SELECT 1 FROM categories WHERE label = 'Fahrräder')
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE lower(c.label) = lower(d.de));

-- Sub-categories go under their main category, one level deep: only categories on top that
-- have no sub-categories of their own, under a main category that is on top itself
UPDATE categories c
SET parent_id = p.id, updated_at = now()
FROM default_categories d
JOIN categories p ON p.label = d.parent AND p.parent_id IS NULL
WHERE c.label = d.de
  AND c.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM categories s WHERE s.parent_id = c.id);

-- Lists follow the creation time, but the seeded categories all share one: put the default
-- ones in their order, so "Kinderfahrzeuge" follows "Fahrräder" and "Sonstiges" stays last
UPDATE categories c
SET created_at = b.first + d.n * interval '1 millisecond'
FROM default_categories d,
  (SELECT min(c.created_at) AS first
   FROM categories c JOIN default_categories d ON d.de = c.label) b
WHERE c.label = d.de
  AND EXISTS (SELECT 1 FROM categories WHERE label = 'Fahrräder');
