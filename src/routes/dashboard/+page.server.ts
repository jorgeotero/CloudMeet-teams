/**
 * Dashboard page - shows event types and recent bookings
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCurrentUser, getUserOrganizations } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	const userId = await getCurrentUser(event);

	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw new Error('Database not available');
	}

	// Get user info
	const user = await db
		.prepare('SELECT id, email, name, slug, profile_image, brand_color, settings, contact_email FROM users WHERE id = ?')
		.bind(userId)
		.first<{ id: string; email: string; name: string; slug: string; profile_image: string | null; brand_color: string | null; settings: string | null; contact_email: string | null }>();

	// Get event types
	const eventTypes = await db
		.prepare(
			`SELECT id, name, slug, duration_minutes as duration, description, is_active
			FROM event_types
			WHERE user_id = ?
			ORDER BY name ASC`
		)
		.bind(userId)
		.all<{
			id: string;
			name: string;
			slug: string;
			duration: number;
			description: string;
			is_active: number;
		}>();

	// Get upcoming bookings (only future meetings)
	const recentBookings = await db
		.prepare(
			`SELECT b.id, b.start_time, b.end_time, b.attendee_name, b.attendee_email,
				b.status, b.created_at, b.attendee_notes, b.canceled_by, b.cancellation_reason,
				b.event_type_id, et.name as event_type_name, et.slug as event_type_slug, et.duration_minutes
			FROM bookings b
			JOIN event_types et ON b.event_type_id = et.id
			WHERE b.user_id = ? AND b.start_time >= datetime('now')
			ORDER BY b.created_at DESC
			LIMIT 20`
		)
		.bind(userId)
		.all<{
			id: string;
			start_time: string;
			end_time: string;
			attendee_name: string;
			attendee_email: string;
			status: string;
			created_at: string;
			event_type_name: string;
			event_type_slug: string;
			event_type_id: string;
			duration_minutes: number;
			attendee_notes: string | null;
			canceled_by: string | null;
			cancellation_reason: string | null;
		}>();

	const appUrl = event.platform?.env?.APP_URL || '';

	// Get user's organizations
	const orgs = await getUserOrganizations(db, userId);
	const currentOrg = orgs.length > 0 ? orgs[0] : null;

	let teamMembers: Array<{
		member_id: string;
		role: 'owner' | 'admin' | 'member';
		joined_at: string;
		user_id: string;
		name: string;
		email: string;
		slug: string;
		profile_image: string | null;
		google_connected: number;
		outlook_connected: number;
	}> = [];

	let teamBookings: Array<{
		id: string;
		start_time: string;
		end_time: string;
		attendee_name: string;
		attendee_email: string;
		attendee_phone: string | null;
		status: string;
		created_at: string;
		meeting_url: string | null;
		event_type_id: string;
		event_type_name: string;
		event_type_slug: string;
		duration_minutes: number;
		attendee_notes: string | null;
		canceled_by: string | null;
		cancellation_reason: string | null;
		host_id: string;
		host_name: string;
		host_email: string;
		host_slug: string;
		host_image: string | null;
	}> = [];

	let pendingInvitations: Array<{
		id: string;
		email: string;
		role: 'owner' | 'admin' | 'member';
		token: string;
		expires_at: string;
		created_at: string;
	}> = [];

	let meetingRooms: Array<{
		id: string;
		organization_id: string;
		name: string;
		location: string | null;
		capacity: number;
		is_active: number;
		created_at: string;
	}> = [];

	if (currentOrg) {
		// Load team members
		const membersQuery = await db
			.prepare(
				`SELECT m.id as member_id, m.role, m.created_at as joined_at,
				u.id as user_id, u.name, u.email, u.slug, u.profile_image,
				(u.google_refresh_token IS NOT NULL) as google_connected,
				(u.outlook_refresh_token IS NOT NULL) as outlook_connected
				FROM organization_members m
				JOIN users u ON m.user_id = u.id
				WHERE m.organization_id = ?
				ORDER BY 
					CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
					u.name ASC`
			)
			.bind(currentOrg.organization_id)
			.all<{
				member_id: string;
				role: 'owner' | 'admin' | 'member';
				joined_at: string;
				user_id: string;
				name: string;
				email: string;
				slug: string;
				profile_image: string | null;
				google_connected: number;
				outlook_connected: number;
			}>();

		teamMembers = membersQuery.results || [];

		// Load team bookings across all members of this organization
		const teamBookingsQuery = await db
			.prepare(
				`SELECT b.id, b.start_time, b.end_time, b.attendee_name, b.attendee_email, b.attendee_phone,
				b.status, b.created_at, b.meeting_url, b.attendee_notes, b.canceled_by, b.cancellation_reason,
				b.event_type_id, et.name as event_type_name, et.slug as event_type_slug, et.duration_minutes,
				u.id as host_id, u.name as host_name, u.email as host_email, u.slug as host_slug, u.profile_image as host_image
				FROM bookings b
				JOIN event_types et ON b.event_type_id = et.id
				JOIN users u ON b.user_id = u.id
				JOIN organization_members m ON u.id = m.user_id
				WHERE m.organization_id = ? AND b.start_time >= datetime('now', '-7 days')
				ORDER BY b.start_time ASC
				LIMIT 50`
			)
			.bind(currentOrg.organization_id)
			.all<{
				id: string;
				start_time: string;
				end_time: string;
				attendee_name: string;
				attendee_email: string;
				attendee_phone: string | null;
				status: string;
				created_at: string;
				meeting_url: string | null;
				event_type_id: string;
				event_type_name: string;
				event_type_slug: string;
				duration_minutes: number;
				attendee_notes: string | null;
				canceled_by: string | null;
				cancellation_reason: string | null;
				host_id: string;
				host_name: string;
				host_email: string;
				host_slug: string;
				host_image: string | null;
			}>();

		teamBookings = teamBookingsQuery.results || [];

		// Load pending invitations
		const invQuery = await db
			.prepare(
				`SELECT id, email, role, token, expires_at, created_at
				FROM organization_invitations
				WHERE organization_id = ? AND expires_at > datetime('now')
				ORDER BY created_at DESC`
			)
			.bind(currentOrg.organization_id)
			.all<{
				id: string;
				email: string;
				role: 'owner' | 'admin' | 'member';
				token: string;
				expires_at: string;
				created_at: string;
			}>();

		pendingInvitations = invQuery.results || [];

		// Load meeting rooms
		const roomsQuery = await db
			.prepare(
				`SELECT id, organization_id, name, location, capacity, is_active, created_at
				FROM meeting_rooms
				WHERE organization_id = ?
				ORDER BY is_active DESC, name ASC`
			)
			.bind(currentOrg.organization_id)
			.all<{
				id: string;
				organization_id: string;
				name: string;
				location: string | null;
				capacity: number;
				is_active: number;
				created_at: string;
			}>();

		meetingRooms = roomsQuery.results || [];
	}

	return {
		user,
		eventTypes: eventTypes.results,
		recentBookings: recentBookings.results,
		appUrl,
		organization: currentOrg,
		teamMembers,
		teamBookings,
		pendingInvitations,
		meetingRooms,
		userRole: currentOrg?.role || 'member'
	};
};
