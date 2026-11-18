-- Sub-categories for every main category, among them bikes and children's vehicles for bike
-- sales and children's bazaars (#300), so the lists stay short. Same tree and order as
-- DEFAULT_CATEGORIES in src/modules/categories.rs.
-- Only for instances that use the default categories: an instance with its own list keeps
-- it, and an empty one gets the whole tree when it is seeded.
CREATE TEMPORARY TABLE default_categories (n int, de text, en text, parent text, added bool) ON COMMIT DROP;
INSERT INTO default_categories VALUES
  (0, 'Kleidung', 'Clothing', NULL, false),
  (1, 'Babykleidung', 'Baby clothes', 'Kleidung', true),
  (2, 'Kinderkleidung', 'Children''s clothes', 'Kleidung', true),
  (3, 'Damenkleidung', 'Women''s clothes', 'Kleidung', true),
  (4, 'Herrenkleidung', 'Men''s clothes', 'Kleidung', true),
  (5, 'Umstandsmode', 'Maternity wear', 'Kleidung', true),
  (6, 'Schuhe', 'Shoes', NULL, false),
  (7, 'Kinderschuhe', 'Children''s shoes', 'Schuhe', true),
  (8, 'Damenschuhe', 'Women''s shoes', 'Schuhe', true),
  (9, 'Herrenschuhe', 'Men''s shoes', 'Schuhe', true),
  (10, 'Sportschuhe', 'Sports shoes', 'Schuhe', true),
  (11, 'Sport', 'Sports', NULL, false),
  (12, 'Ski & Snowboard', 'Skis & snowboards', 'Sport', true),
  (13, 'Skischuhe', 'Ski boots', 'Sport', true),
  (14, 'Sportbekleidung', 'Sportswear', 'Sport', true),
  (15, 'Helme & Protektoren', 'Helmets & protectors', 'Sport', true),
  (16, 'Ballsport', 'Ball sports', 'Sport', true),
  (17, 'Fitness', 'Fitness', 'Sport', true),
  (18, 'Camping & Outdoor', 'Camping & outdoor', 'Sport', true),
  (19, 'Fahrräder', 'Bikes', NULL, false),
  (20, 'Kinderfahrräder', 'Children''s bikes', 'Fahrräder', true),
  (21, 'Lastenräder', 'Cargo bikes', 'Fahrräder', true),
  (22, 'E-Bikes & Pedelecs', 'E-bikes', 'Fahrräder', true),
  (23, 'Fahrradanhänger', 'Bike trailers', 'Fahrräder', true),
  (24, 'Fahrrad-Kindersitze', 'Child bike seats', 'Fahrräder', true),
  (25, 'Fahrradzubehör', 'Bike accessories', 'Fahrräder', true),
  (26, 'Kinderfahrzeuge', 'Children''s vehicles', NULL, true),
  (27, 'Laufräder', 'Balance bikes', 'Kinderfahrzeuge', true),
  (28, 'Roller & Scooter', 'Scooters', 'Kinderfahrzeuge', true),
  (29, 'Einräder', 'Unicycles', 'Kinderfahrzeuge', true),
  (30, 'Bobbycars & Rutschfahrzeuge', 'Ride-on toys', 'Kinderfahrzeuge', true),
  (31, 'Kinderwagen & Buggys', 'Prams & buggies', 'Kinderfahrzeuge', true),
  (32, 'Elektronik', 'Electronics', NULL, false),
  (33, 'Handys & Smartphones', 'Mobile phones', 'Elektronik', true),
  (34, 'Computer & Tablets', 'Computers & tablets', 'Elektronik', true),
  (35, 'Foto & Kamera', 'Photo & camera', 'Elektronik', true),
  (36, 'Konsolen & Videospiele', 'Consoles & video games', 'Elektronik', true),
  (37, 'Audio & HiFi', 'Audio & hi-fi', 'Elektronik', true),
  (38, 'Bücher', 'Books', NULL, false),
  (39, 'Kinderbücher', 'Children''s books', 'Bücher', true),
  (40, 'Romane', 'Novels', 'Bücher', true),
  (41, 'Sachbücher', 'Non-fiction', 'Bücher', true),
  (42, 'Kochbücher', 'Cookbooks', 'Bücher', true),
  (43, 'Comics', 'Comics', 'Bücher', true),
  (44, 'Spielzeug', 'Toys', NULL, false),
  (45, 'Babyspielzeug', 'Baby toys', 'Spielzeug', true),
  (46, 'Puppen & Plüsch', 'Dolls & plush', 'Spielzeug', true),
  (47, 'Lego & Bausteine', 'Lego & building blocks', 'Spielzeug', true),
  (48, 'Brett- & Kartenspiele', 'Board & card games', 'Spielzeug', true),
  (49, 'Outdoor-Spielzeug', 'Outdoor toys', 'Spielzeug', true),
  (50, 'Möbel', 'Furniture', NULL, false),
  (51, 'Kindermöbel', 'Children''s furniture', 'Möbel', true),
  (52, 'Wohnzimmermöbel', 'Living room', 'Möbel', true),
  (53, 'Schlafzimmermöbel', 'Bedroom', 'Möbel', true),
  (54, 'Büromöbel', 'Office furniture', 'Möbel', true),
  (55, 'Gartenmöbel', 'Garden furniture', 'Möbel', true),
  (56, 'Haushalt', 'Household', NULL, false),
  (57, 'Küche & Kochen', 'Kitchen & cooking', 'Haushalt', true),
  (58, 'Dekoration', 'Decoration', 'Haushalt', true),
  (59, 'Heimtextilien', 'Home textiles', 'Haushalt', true),
  (60, 'Werkzeug & Garten', 'Tools & garden', 'Haushalt', true),
  (61, 'Accessoires', 'Accessories', NULL, false),
  (62, 'Taschen & Rucksäcke', 'Bags & backpacks', 'Accessoires', true),
  (63, 'Schmuck & Uhren', 'Jewellery & watches', 'Accessoires', true),
  (64, 'Mützen & Schals', 'Hats & scarves', 'Accessoires', true),
  (65, 'Sonnenbrillen', 'Sunglasses', 'Accessoires', true),
  (66, 'Gürtel', 'Belts', 'Accessoires', true),
  (67, 'Sonstiges', 'Other', NULL, false),
  (68, 'Musikinstrumente', 'Musical instruments', 'Sonstiges', true),
  (69, 'Filme & Musik', 'Films & music', 'Sonstiges', true),
  (70, 'Basteln & Handarbeit', 'Crafts & needlework', 'Sonstiges', true),
  (71, 'Sammeln', 'Collectibles', 'Sonstiges', true);

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
