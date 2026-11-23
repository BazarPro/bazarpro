-- Extra item fields an admin picked for a category (#300), e.g. {frameNumber,color}; the ids
-- of category_fields::SELECTABLE. NULL: the fields follow the name, as before.
ALTER TABLE categories ADD COLUMN fields text[];
