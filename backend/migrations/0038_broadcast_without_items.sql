-- Messages to sellers who have not announced any item yet (#304)
ALTER TYPE broadcast_audience ADD VALUE IF NOT EXISTS 'withoutItems';
