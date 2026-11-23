-- Copies every item of the biggest event 26 times (75 demo items become 2025) and makes
-- all items sellable, to measure a large bazaar (#229). Restart the backend afterwards:
-- its cache still holds the short list.
--   docker exec -i lasttest-postgres-1 psql -U bazarpro -v ON_ERROR_STOP=1 < big-event.sql
BEGIN;
CREATE TEMP TABLE big AS
SELECT event_id FROM event_products GROUP BY event_id ORDER BY count(*) DESC LIMIT 1;
CREATE TEMP TABLE copies AS
SELECT ep.event_id, ep.product_id AS old_id, gen_random_uuid() AS new_id, n,
       ep.discount_percent, ep.location_category_id
FROM event_products ep JOIN big USING (event_id), generate_series(1, 26) n;
INSERT INTO products (id, title, vendor_id, description, condition, category_id, price,
                      ready_for_sale, sold, attributes, accepts_offers, minimum_price)
SELECT c.new_id, p.title || ' #' || c.n, p.vendor_id, p.description, p.condition,
       p.category_id, p.price, p.ready_for_sale, false, p.attributes, p.accepts_offers,
       p.minimum_price
FROM copies c JOIN products p ON p.id = c.old_id;
INSERT INTO product_images
SELECT c.new_id, i.position, i.file_id
FROM copies c JOIN product_images i ON i.product_id = c.old_id;
INSERT INTO event_products (event_id, product_id, status, discount_percent, location_category_id)
SELECT event_id, new_id, 'available', discount_percent, location_category_id FROM copies;
UPDATE event_products SET status = 'available';
UPDATE event_sellers SET payout_received = false;
COMMIT;
ANALYZE;
