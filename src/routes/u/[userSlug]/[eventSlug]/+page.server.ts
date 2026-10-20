/**
 * Direct personal booking page: /u/[userSlug]/[eventSlug]
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, url }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const { userSlug, eventSlug } = params;
	const db = env.DB;

	try {
		// Look up user by slug
		const user = await db
			.prepare('SELECT id, slug, name, profile_image, brand_color, settings, outlook_refresh_token FROM users WHERE slug = ?')
			.bind(userSlug)
			.first<{ id: string; slug: string; name: string; profile_image: string | null; brand_color: string | null; settings: string | null; outlook_refresh_token: string | null }>();

		if (!user) {
			throw error(404, 'User not found');
		}

		// Look up event type for this specific user
		const eventType = await db
			.prepare(
				`SELECT e.id, e.name, e.slug, e.duration_minutes as duration, e.description, e.is_active,
					e.cover_image, e.invite_calendar, e.location_type, e.meeting_room_id,
					r.name as room_name, r.location as room_location
				FROM event_types e
				LEFT JOIN meeting_rooms r ON e.meeting_room_id = r.id
				WHERE e.user_id = ? AND e.slug = ? AND e.is_active = 1`
			)
			.bind(user.id, eventSlug)
			.first<{
				id: string;
				name: string;
				slug: string;
				duration: number;
				description: string;
				is_active: number;
				cover_image: string | null;
				invite_calendar: string | null;
				location_type: string | null;
				meeting_room_id: string | null;
				room_name: string | null;
				room_location: string | null;
			}>();

		if (!eventType) {
			throw error(404, 'Event type not found');
		}

		// Look up organization membership for this user (matching slug prefix if multi-tenant)
		let organization: { id: string; name: string; slug: string; logoUrl: string | null } | null = null;
		try {
			const orgPrefix = userSlug.includes('-') ? userSlug.split('-')[0] : '';
			const org = await db
				.prepare(
					`SELECT o.id, o.name, o.slug, o.logo_url
					FROM organizations o
					JOIN organization_members om ON om.organization_id = o.id
					WHERE om.user_id = ?
					ORDER BY CASE WHEN o.slug = ? THEN 0 ELSE 1 END, om.created_at DESC
					LIMIT 1`
				)
				.bind(user.id, orgPrefix)
				.first<{ id: string; name: string; slug: string; logo_url: string | null }>();

			if (org) {
				organization = {
					id: org.id,
					name: org.name,
					slug: org.slug,
					logoUrl: org.logo_url
				};
			}
		} catch (orgErr) {
			console.warn('Could not query organization for user:', orgErr);
		}

		// Parse user settings
		let userSettings: { timeFormat?: string; defaultInviteCalendar?: string } = {};
		try {
			userSettings = user.settings ? JSON.parse(user.settings) : {};
		} catch {}

		// Determine effective invite calendar
		const outlookConnected = !!user.outlook_refresh_token;
		const outlookConfigured = !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
		let effectiveInviteCalendar = eventType.invite_calendar || userSettings.defaultInviteCalendar || 'google';
		if (effectiveInviteCalendar === 'outlook' && (!outlookConnected || !outlookConfigured)) {
			effectiveInviteCalendar = 'google';
		}

		// Extract query params for prefilling and embed mode
		const name = url.searchParams.get('name') || url.searchParams.get('attendeeName') || '';
		const email = url.searchParams.get('email') || url.searchParams.get('attendeeEmail') || '';
		const phone = url.searchParams.get('phone') || url.searchParams.get('attendeePhone') || '';
		const notes = url.searchParams.get('notes') || '';
		const lockPrefill = ['1', 'true', 'yes'].includes((url.searchParams.get('lock_prefill') || '').toLowerCase());
		const externalRef = url.searchParams.get('ref') || url.searchParams.get('external_ref') || '';
		const isEmbed = ['1', 'true', 'yes'].includes((url.searchParams.get('embed') || '').toLowerCase());

		// Extract UTM and metadata parameters
		const metadata: Record<string, string> = {};
		for (const [key, value] of url.searchParams.entries()) {
			if (key.startsWith('utm_') || key.startsWith('meta_')) {
				metadata[key] = value;
			}
		}

		return {
			slug: eventType.slug,
			eventType: {
				...eventType,
				invite_calendar: effectiveInviteCalendar
			},
			user: {
				id: user.id,
				slug: user.slug,
				name: user.name,
				profileImage: user.profile_image,
				brandColor: user.brand_color && user.brand_color !== '#3b82f6' ? user.brand_color : '#059669',
				timeFormat: userSettings.timeFormat || '12h'
			},
			organization,
			prefill: {
				name,
				email,
				phone,
				notes,
				lockPrefill,
				externalRef,
				metadata,
				isEmbed
			}
		};
	} catch (err: any) {
		console.error('Personal booking page load error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to load booking page');
	}
};
