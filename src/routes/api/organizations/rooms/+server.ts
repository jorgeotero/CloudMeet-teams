/**
 * API endpoints for managing organization meeting rooms
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurrentUser } from '$lib/server/auth';

/**
 * GET /api/organizations/rooms - List meeting rooms for user's organization
 */
export const GET: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Get user's organization membership
	const membership = await db
		.prepare(
			`SELECT m.organization_id, m.role, o.name as organization_name
			FROM organization_members m
			JOIN organizations o ON m.organization_id = o.id
			WHERE m.user_id = ?`
		)
		.bind(userId)
		.first<{ organization_id: string; role: 'owner' | 'admin' | 'member'; organization_name: string }>();

	if (!membership) {
		return json({ rooms: [] });
	}

	const rooms = await db
		.prepare(
			`SELECT id, organization_id, name, location, capacity, is_active, created_at
			FROM meeting_rooms
			WHERE organization_id = ?
			ORDER BY is_active DESC, name ASC`
		)
		.bind(membership.organization_id)
		.all<{
			id: string;
			organization_id: string;
			name: string;
			location: string | null;
			capacity: number;
			is_active: number;
			created_at: string;
		}>();

	return json({
		rooms: rooms.results || [],
		role: membership.role
	});
};

/**
 * POST /api/organizations/rooms - Create a meeting room (Admin/Owner only)
 */
export const POST: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Verify user is owner or admin
	const membership = await db
		.prepare('SELECT organization_id, role FROM organization_members WHERE user_id = ?')
		.bind(userId)
		.first<{ organization_id: string; role: 'owner' | 'admin' | 'member' }>();

	if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
		throw error(403, 'Forbidden. Only organization owners and admins can manage meeting rooms.');
	}

	const body = await event.request.json() as {
		name: string;
		location?: string;
		capacity?: number;
	};

	if (!body.name || !body.name.trim()) {
		throw error(400, 'Room name is required');
	}

	const roomId = crypto.randomUUID();
	const name = body.name.trim();
	const location = body.location?.trim() || null;
	const capacity = typeof body.capacity === 'number' && body.capacity > 0 ? Math.floor(body.capacity) : 4;

	await db
		.prepare(
			`INSERT INTO meeting_rooms (id, organization_id, name, location, capacity, is_active, created_at)
			VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
		)
		.bind(roomId, membership.organization_id, name, location, capacity)
		.run();

	return json({
		success: true,
		room: {
			id: roomId,
			organization_id: membership.organization_id,
			name,
			location,
			capacity,
			is_active: 1
		}
	}, { status: 201 });
};

/**
 * PATCH /api/organizations/rooms - Update meeting room (Admin/Owner only)
 */
export const PATCH: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const membership = await db
		.prepare('SELECT organization_id, role FROM organization_members WHERE user_id = ?')
		.bind(userId)
		.first<{ organization_id: string; role: 'owner' | 'admin' | 'member' }>();

	if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
		throw error(403, 'Forbidden. Only organization owners and admins can manage meeting rooms.');
	}

	const body = await event.request.json() as {
		id: string;
		name?: string;
		location?: string | null;
		capacity?: number;
		is_active?: boolean | number;
	};

	if (!body.id) {
		throw error(400, 'Room ID is required');
	}

	// Verify room belongs to this organization
	const existing = await db
		.prepare('SELECT id, name, location, capacity, is_active FROM meeting_rooms WHERE id = ? AND organization_id = ?')
		.bind(body.id, membership.organization_id)
		.first<{ id: string; name: string; location: string | null; capacity: number; is_active: number }>();

	if (!existing) {
		throw error(404, 'Meeting room not found');
	}

	const name = body.name !== undefined ? body.name.trim() : existing.name;
	const location = body.location !== undefined ? (body.location?.trim() || null) : existing.location;
	const capacity = body.capacity !== undefined ? Math.max(1, Math.floor(body.capacity)) : existing.capacity;
	const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

	await db
		.prepare(
			`UPDATE meeting_rooms
			SET name = ?, location = ?, capacity = ?, is_active = ?
			WHERE id = ? AND organization_id = ?`
		)
		.bind(name, location, capacity, isActive, body.id, membership.organization_id)
		.run();

	return json({
		success: true,
		room: {
			id: body.id,
			organization_id: membership.organization_id,
			name,
			location,
			capacity,
			is_active: isActive
		}
	});
};

/**
 * DELETE /api/organizations/rooms - Delete meeting room (Admin/Owner only)
 */
export const DELETE: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const membership = await db
		.prepare('SELECT organization_id, role FROM organization_members WHERE user_id = ?')
		.bind(userId)
		.first<{ organization_id: string; role: 'owner' | 'admin' | 'member' }>();

	if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
		throw error(403, 'Forbidden. Only organization owners and admins can manage meeting rooms.');
	}

	const body = await event.request.json() as { id: string };
	if (!body.id) {
		throw error(400, 'Room ID is required');
	}

	await db
		.prepare('DELETE FROM meeting_rooms WHERE id = ? AND organization_id = ?')
		.bind(body.id, membership.organization_id)
		.run();

	return json({ success: true, message: 'Meeting room deleted successfully' });
};
