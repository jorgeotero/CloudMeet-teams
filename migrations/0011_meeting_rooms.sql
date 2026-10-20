-- Migration: 0011_meeting_rooms.sql
-- Description: Offline Meeting Rooms per Organization with conflict detection

CREATE TABLE IF NOT EXISTS meeting_rooms (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    capacity INTEGER DEFAULT 4,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add meeting_room_id to event_types and bookings
ALTER TABLE event_types ADD COLUMN meeting_room_id TEXT REFERENCES meeting_rooms(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN meeting_room_id TEXT REFERENCES meeting_rooms(id) ON DELETE SET NULL;

-- Indices
CREATE INDEX IF NOT EXISTS idx_meeting_rooms_org ON meeting_rooms(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(meeting_room_id);
CREATE INDEX IF NOT EXISTS idx_event_types_room ON event_types(meeting_room_id);
