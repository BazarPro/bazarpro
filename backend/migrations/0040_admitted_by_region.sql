-- Sellers a bazaar's region let in by their postal code (#304): only theirs stays fixed
-- until the bazaar ends. The access code, an invitation or the team let others in too.
ALTER TABLE event_sellers ADD COLUMN admitted_by_region boolean NOT NULL DEFAULT false;
