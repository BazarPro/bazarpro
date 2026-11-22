-- What raised a marker, where a later step has to take back just its own: a rejection
-- taken back must not clear the organizer's unread messages at the same bazaar.
ALTER TABLE unread_notices ADD COLUMN reason text;
