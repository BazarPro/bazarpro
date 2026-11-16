-- Direct sale (features.directSale): the buyer pays the seller at the item, the cash desk
-- books the sale and takes only the commission from the seller. Such a sale pays nothing
-- out; the till holds its commission instead of the price (events.getEventFinancialSummary).
ALTER TABLE purchases ADD COLUMN direct_sale boolean NOT NULL DEFAULT false;
