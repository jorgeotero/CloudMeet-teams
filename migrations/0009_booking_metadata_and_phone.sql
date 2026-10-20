-- Add attendee_phone, external_ref, and metadata columns to bookings
ALTER TABLE bookings ADD COLUMN attendee_phone TEXT;
ALTER TABLE bookings ADD COLUMN external_ref TEXT;
ALTER TABLE bookings ADD COLUMN metadata TEXT;
