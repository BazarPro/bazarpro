-- Extra fields become data an admin edits (#300): the definitions in their own table, the
-- categories name the ones they use. Plus the default tree for bike sales and children's
-- bazaars: more kinds of bikes, "Baby & Kind", "Freizeit & Hobby" and a "Weitere …" in
-- every main category, since items now go into the sub-categories.

CREATE TABLE category_field_definitions (
  -- Picked by categories (categories.fields), e.g. 'clothingSize'
  id text PRIMARY KEY,
  -- Under which the value is stored on the item; sizes share 'size'
  key text NOT NULL,
  label text NOT NULL,
  label_en text,
  placeholder text,
  placeholder_en text,
  hint text,
  hint_en text,
  -- At most 7 characters, so it fits on the labels (e.g. a size)
  short boolean NOT NULL DEFAULT false,
  -- Sellers may enter the agreed "not found", e.g. for a worn frame number
  not_found_button boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The fields so far, with the texts of src/locales/<language>/records.json
INSERT INTO category_field_definitions
  (id, key, label, label_en, placeholder, placeholder_en, hint, hint_en, short, not_found_button, position)
VALUES
  ('frameNumber', 'frameNumber', 'Rahmennummer', 'Frame number', 'z. B. WBK123456', 'e.g. WBK123456',
   'Nicht gefunden? Schreib „nicht gefunden“ hinein – wir suchen sie vor Ort gemeinsam.',
   'Can''t find it? Enter “not found” – we''ll look for it together on site.', false, true, 1),
  ('frameSize', 'frameSize', 'Rahmengröße', 'Frame size', 'z. B. 52 cm oder M', 'e.g. 52 cm or M', NULL, NULL, false, false, 2),
  ('wheelSize', 'wheelSize', 'Laufradgröße', 'Wheel size', 'z. B. 28 Zoll', 'e.g. 28 inch', NULL, NULL, false, false, 3),
  ('brand', 'brand', 'Marke', 'Brand', NULL, NULL, NULL, NULL, false, false, 7),
  ('color', 'color', 'Farbe', 'Color', 'z. B. Rot', 'e.g. red', NULL, NULL, false, false, 8),
  ('clothingSize', 'size', 'Größe', 'Size', 'z. B. M oder 128', 'e.g. M or 128', NULL, NULL, true, false, 4),
  ('shoeSize', 'size', 'Größe (EU)', 'Size (EU)', 'z. B. 38', 'e.g. 38', NULL, NULL, true, false, 5),
  ('sportSize', 'size', 'Größe / Länge', 'Size / length', 'z. B. 160 cm', 'e.g. 160 cm', NULL, NULL, true, false, 6),
  ('model', 'model', 'Modell', 'Model', NULL, NULL, NULL, NULL, false, false, 9);

CREATE TEMPORARY TABLE default_categories (n int, de text, en text, parent text, added bool) ON COMMIT DROP;
INSERT INTO default_categories VALUES
  (0, 'Kleidung', 'Clothing', NULL, false),
  (1, 'Babykleidung', 'Baby clothes', 'Kleidung', false),
  (2, 'Kinderkleidung', 'Children''s clothes', 'Kleidung', false),
  (3, 'Damenkleidung', 'Women''s clothes', 'Kleidung', false),
  (4, 'Herrenkleidung', 'Men''s clothes', 'Kleidung', false),
  (5, 'Umstandsmode', 'Maternity wear', 'Kleidung', false),
  (6, 'Schuhe', 'Shoes', NULL, false),
  (7, 'Kinderschuhe', 'Children''s shoes', 'Schuhe', false),
  (8, 'Damenschuhe', 'Women''s shoes', 'Schuhe', false),
  (9, 'Herrenschuhe', 'Men''s shoes', 'Schuhe', false),
  (10, 'Sportschuhe', 'Sports shoes', 'Schuhe', false),
  (11, 'Sport', 'Sports', NULL, false),
  (12, 'Wintersport', 'Winter sports', 'Sport', false),
  (13, 'Skischuhe', 'Ski boots', 'Sport', false),
  (14, 'Sportbekleidung', 'Sportswear', 'Sport', false),
  (15, 'Helme & Protektoren', 'Helmets & protectors', 'Sport', false),
  (16, 'Ballsport', 'Ball sports', 'Sport', false),
  (17, 'Fitness', 'Fitness', 'Sport', false),
  (18, 'Camping & Outdoor', 'Camping & outdoor', 'Sport', false),
  (19, 'Weitere Sportarten', 'Other sports', 'Sport', true),
  (20, 'Fahrräder', 'Bikes', NULL, false),
  (21, 'Cityräder & Hollandräder', 'City & Dutch bikes', 'Fahrräder', true),
  (22, 'Trekkingräder', 'Trekking bikes', 'Fahrräder', true),
  (23, 'Mountainbikes (MTB)', 'Mountain bikes (MTB)', 'Fahrräder', true),
  (24, 'Rennräder & Gravelbikes', 'Road & gravel bikes', 'Fahrräder', true),
  (25, 'BMX & Dirtbikes', 'BMX & dirt bikes', 'Fahrräder', true),
  (26, 'Falträder & Klappräder', 'Folding bikes', 'Fahrräder', true),
  (27, 'Kinder- & Jugendräder', 'Children''s & youth bikes', 'Fahrräder', false),
  (28, 'E-Bikes & Pedelecs', 'E-bikes', 'Fahrräder', false),
  (29, 'Lastenräder', 'Cargo bikes', 'Fahrräder', false),
  (30, 'Fahrradanhänger', 'Bike trailers', 'Fahrräder', false),
  (31, 'Fahrrad-Kindersitze', 'Child bike seats', 'Fahrräder', false),
  (32, 'Fahrradzubehör', 'Bike accessories', 'Fahrräder', false),
  (33, 'Kinderfahrzeuge', 'Children''s vehicles', NULL, false),
  (34, 'Laufräder', 'Balance bikes', 'Kinderfahrzeuge', false),
  (35, 'Roller & Scooter', 'Scooters', 'Kinderfahrzeuge', false),
  (36, 'Einräder', 'Unicycles', 'Kinderfahrzeuge', false),
  (37, 'Bobbycars & Rutschfahrzeuge', 'Ride-on toys', 'Kinderfahrzeuge', false),
  (38, 'Baby & Kind', 'Baby & child', NULL, true),
  (39, 'Kinderwagen & Buggys', 'Prams & buggies', 'Baby & Kind', false),
  (40, 'Autokindersitze', 'Car seats', 'Baby & Kind', true),
  (41, 'Babyausstattung', 'Baby gear', 'Baby & Kind', true),
  (42, 'Elektronik', 'Electronics', NULL, false),
  (43, 'Handys & Smartphones', 'Mobile phones', 'Elektronik', false),
  (44, 'Computer & Tablets', 'Computers & tablets', 'Elektronik', false),
  (45, 'Foto & Kamera', 'Photo & camera', 'Elektronik', false),
  (46, 'Konsolen & Videospiele', 'Consoles & video games', 'Elektronik', false),
  (47, 'Audio & HiFi', 'Audio & hi-fi', 'Elektronik', false),
  (48, 'Weitere Elektronik', 'Other electronics', 'Elektronik', true),
  (49, 'Bücher', 'Books', NULL, false),
  (50, 'Kinder- & Jugendbücher', 'Children''s & youth books', 'Bücher', false),
  (51, 'Romane', 'Novels', 'Bücher', false),
  (52, 'Sachbücher', 'Non-fiction', 'Bücher', false),
  (53, 'Kochbücher', 'Cookbooks', 'Bücher', false),
  (54, 'Comics', 'Comics', 'Bücher', false),
  (55, 'Weitere Bücher', 'Other books', 'Bücher', true),
  (56, 'Spielzeug', 'Toys', NULL, false),
  (57, 'Babyspielzeug', 'Baby toys', 'Spielzeug', false),
  (58, 'Puppen & Plüsch', 'Dolls & plush', 'Spielzeug', false),
  (59, 'Lego & Bausteine', 'Lego & building blocks', 'Spielzeug', false),
  (60, 'Spiele & Puzzles', 'Games & puzzles', 'Spielzeug', false),
  (61, 'Outdoor-Spielzeug', 'Outdoor toys', 'Spielzeug', false),
  (62, 'Weiteres Spielzeug', 'Other toys', 'Spielzeug', true),
  (63, 'Möbel', 'Furniture', NULL, false),
  (64, 'Kindermöbel', 'Children''s furniture', 'Möbel', false),
  (65, 'Wohnzimmermöbel', 'Living room', 'Möbel', false),
  (66, 'Schlafzimmermöbel', 'Bedroom', 'Möbel', false),
  (67, 'Büromöbel', 'Office furniture', 'Möbel', false),
  (68, 'Gartenmöbel', 'Garden furniture', 'Möbel', false),
  (69, 'Weitere Möbel', 'Other furniture', 'Möbel', true),
  (70, 'Haushalt', 'Household', NULL, false),
  (71, 'Küche & Kochen', 'Kitchen & cooking', 'Haushalt', false),
  (72, 'Dekoration', 'Decoration', 'Haushalt', false),
  (73, 'Heimtextilien', 'Home textiles', 'Haushalt', false),
  (74, 'Werkzeug & Garten', 'Tools & garden', 'Haushalt', false),
  (75, 'Weiteres für den Haushalt', 'Other household goods', 'Haushalt', true),
  (76, 'Accessoires', 'Accessories', NULL, false),
  (77, 'Taschen & Rucksäcke', 'Bags & backpacks', 'Accessoires', false),
  (78, 'Schmuck & Uhren', 'Jewellery & watches', 'Accessoires', false),
  (79, 'Mützen & Schals', 'Hats & scarves', 'Accessoires', false),
  (80, 'Sonnenbrillen', 'Sunglasses', 'Accessoires', false),
  (81, 'Gürtel', 'Belts', 'Accessoires', false),
  (82, 'Weitere Accessoires', 'Other accessories', 'Accessoires', true),
  (83, 'Freizeit & Hobby', 'Leisure & hobbies', NULL, true),
  (84, 'Musikinstrumente', 'Musical instruments', 'Freizeit & Hobby', false),
  (85, 'Filme & Musik', 'Films & music', 'Freizeit & Hobby', false),
  (86, 'Basteln & Handarbeit', 'Crafts & needlework', 'Freizeit & Hobby', false),
  (87, 'Sammeln', 'Collectibles', 'Freizeit & Hobby', false),
  (88, 'Sonstiges', 'Other', NULL, false);

-- Renamed defaults, with their English name if it is still the default one
UPDATE categories c
SET label = r.new, updated_at = now(),
    translations = CASE WHEN c.translations->>'en' = r.old_en
      THEN jsonb_set(c.translations, '{en}', to_jsonb(r.new_en)) ELSE c.translations END
FROM (VALUES
  ('Kinderfahrräder', 'Kinder- & Jugendräder', 'Children''s bikes', 'Children''s & youth bikes'),
  ('Ski & Snowboard', 'Wintersport', 'Skis & snowboards', 'Winter sports'),
  ('Kinderbücher', 'Kinder- & Jugendbücher', 'Children''s books', 'Children''s & youth books'),
  ('Brett- & Kartenspiele', 'Spiele & Puzzles', 'Board & card games', 'Games & puzzles')
) AS r (old, new, old_en, new_en)
WHERE c.label = r.old
  AND EXISTS (SELECT 1 FROM categories WHERE label = 'Fahrräder')
  AND NOT EXISTS (SELECT 1 FROM categories o WHERE lower(o.label) = lower(r.new));

-- Only the added ones, where the default categories are in use
INSERT INTO categories (label, translations)
SELECT d.de, jsonb_build_object('en', d.en)
FROM default_categories d
WHERE d.added
  AND EXISTS (SELECT 1 FROM categories WHERE label = 'Fahrräder')
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE lower(c.label) = lower(d.de));

-- Default sub-categories under their main category: those on top, and those that moved
-- (prams from "Kinderfahrzeuge" to "Baby & Kind", hobbies from "Sonstiges")
UPDATE categories c
SET parent_id = p.id, updated_at = now()
FROM default_categories d
JOIN categories p ON p.label = d.parent AND p.parent_id IS NULL
WHERE c.label = d.de
  AND c.id <> p.id
  AND NOT EXISTS (SELECT 1 FROM categories s WHERE s.parent_id = c.id)
  AND (c.parent_id IS NULL
    OR (c.label = 'Kinderwagen & Buggys'
        AND c.parent_id = (SELECT id FROM categories WHERE label = 'Kinderfahrzeuge'))
    OR (d.parent = 'Freizeit & Hobby'
        AND c.parent_id = (SELECT id FROM categories WHERE label = 'Sonstiges')));

-- The fields so far followed the name; now each category names its own. Same rules as
-- before (the first that matches wins; "Fahrradanhänger" and the like have none).
UPDATE categories
SET fields = CASE
  WHEN label ~* 'fahrr|räder|\yrad\y|rad$|bike|pedelec|\ymtb\y|bmx'
    AND label !~* 'zubehör|teile|bekleidung|helm|anhänger|schloss|sitz|einr(a|ä)d'
    THEN '{frameNumber,frameSize,wheelSize,brand,color}'::text[]
  WHEN label ~* 'schuh|stiefel|sneaker' THEN '{shoeSize,brand}'::text[]
  WHEN label ~* 'kleid|jacke|hose|\ymode\y|mode$|shirt|pullover'
    THEN '{clothingSize,brand,color}'::text[]
  WHEN label ~* 'sport|\yski|snowboard' THEN '{sportSize,brand,color}'::text[]
  WHEN label ~* 'elektron|handy|smartphone|computer|laptop|tablet|kamera|konsole'
    THEN '{brand,model}'::text[]
  WHEN label ~* 'fahrr|räder|\yrad\y|rad$|bike|pedelec|\ymtb\y|bmx' THEN '{}'::text[]
END
WHERE fields IS NULL;

-- A sub-category with the fields of its main category takes them from there, so a change
-- of the main category reaches it
UPDATE categories c
SET fields = NULL
FROM categories p
WHERE c.parent_id = p.id AND c.fields IS NOT NULL AND c.fields = p.fields;
-- No fields on top, or below a main category without any: nothing to pick
UPDATE categories c
SET fields = NULL
WHERE c.fields = '{}'
  AND (c.parent_id IS NULL
    OR EXISTS (SELECT 1 FROM categories p WHERE p.id = c.parent_id
               AND (p.fields IS NULL OR p.fields = '{}')));

-- Lists follow the creation time: the default ones in their order
UPDATE categories c
SET created_at = b.first + d.n * interval '1 millisecond'
FROM default_categories d,
  (SELECT min(c.created_at) AS first
   FROM categories c JOIN default_categories d ON d.de = c.label) b
WHERE c.label = d.de
  AND EXISTS (SELECT 1 FROM categories WHERE label = 'Fahrräder');
