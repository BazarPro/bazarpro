-- Picture of a bazaar's region (#304): the app draws the chosen postal code areas when the
-- organizer saves, and sellers see it next to the postal codes
ALTER TABLE events ADD COLUMN region_map_image_id uuid REFERENCES files (id);
