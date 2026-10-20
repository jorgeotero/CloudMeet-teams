/**
 * Availability API endpoint
 * Returns available time slots based on:
 * 1. User's availability rules (weekly schedule)
 * 2. Google Calendar busy times
 * 3. Outlook Calendar busy times
 * 4. Existing bookings
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBusyTimes, getValidAccessToken } from '$lib/server/google-calendar';
import { getOutlookBusyTimes, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';

interface TimeSlot {
	start: string;
	end: string;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const eventSlug = url.searchParams.get('event');
	const date = url.searchParams.get('date'); // YYYY-MM-DD
	const userIdParam = url.searchParams.get('userId');
	const userSlugParam = url.searchParams.get('user') || url.searchParams.get('userSlug');

	if (!eventSlug || !date) {
		throw error(400, 'Missing required parameters');
	}

	try {
		const db = env.DB;

		// Resolve host user dynamically by userId or userSlug, falling back to first user
		let user: { id: string; slug: string; timezone: string | null; settings: string | null } | null = null;
		if (userIdParam) {
			user = await db
				.prepare('SELECT id, slug, timezone, settings FROM users WHERE id = ?')
				.bind(userIdParam)
				.first<{ id: string; slug: string; timezone: string | null; settings: string | null }>();
		} else if (userSlugParam) {
			user = await db
				.prepare('SELECT id, slug, timezone, settings FROM users WHERE slug = ?')
				.bind(userSlugParam)
				.first<{ id: string; slug: string; timezone: string | null; settings: string | null }>();
		} else {
			user = await db
				.prepare('SELECT id, slug, timezone, settings FROM users LIMIT 1')
				.first<{ id: string; slug: string; timezone: string | null; settings: string | null }>();
		}

		if (!user) {
			throw error(404, 'User not found');
		}

		// Check cache first to avoid expensive DB/API calls
		const cacheKey = `availability:${user.id}:${eventSlug}:${date}`;
		const cached = await env.KV.get(cacheKey);
		if (cached) {
			return json(JSON.parse(cached));
		}

		const userTimezone = (user.timezone && user.timezone !== 'UTC') ? user.timezone : 'America/Monterrey';

		// Minimum notice: 1 day buffer (cannot book same-day or next-day meetings)
		const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
		const tomorrowDate = new Date();
		tomorrowDate.setDate(tomorrowDate.getDate() + 1);
		const tomorrowStr = todayFormatter.format(tomorrowDate);

		if (date <= tomorrowStr) {
			return json({ slots: [] });
		}

		// Parse user settings for global calendar defaults
		let userSettings: { defaultAvailabilityCalendars?: string; selectedGoogleCalendars?: string[] } = {};
		try {
			userSettings = user.settings ? JSON.parse(user.settings) : {};
		} catch {
			userSettings = {};
		}

		const eventType = await db
			.prepare('SELECT id, duration_minutes as duration, buffer_minutes, availability_calendars, meeting_room_id FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1')
			.bind(user.id, eventSlug)
			.first<{ id: string; duration: number; buffer_minutes: number | null; availability_calendars: string | null; meeting_room_id: string | null }>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		// Helper to create a Date in user's timezone
		// Takes a date string (YYYY-MM-DD) and time string (HH:MM) in user's timezone
		// and returns a UTC Date
		function createDateInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
			const [hour, minute] = timeStr.split(':').map(Number);
			const dateTimeStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			});

			const targetDate = new Date(dateTimeStr + 'Z');
			const parts = formatter.formatToParts(targetDate);
			const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
			const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

			const targetMinutes = hour * 60 + minute;
			const actualMinutes = tzHour * 60 + tzMinute;
			let offsetMinutes = actualMinutes - targetMinutes;

			if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
			if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

			return new Date(targetDate.getTime() - offsetMinutes * 60 * 1000);
		}

		// Check availability overrides for this date
		const overrides = await db
			.prepare(
				`SELECT available, start_time, end_time
				FROM availability_overrides
				WHERE user_id = ? AND date = ?
				ORDER BY start_time`
			)
			.bind(user.id, date)
			.all<{ available: number | boolean; start_time: string | null; end_time: string | null }>();

		const overrideList = overrides.results || [];

		// If an override has available = 0 without start/end times, treat the whole date as unavailable
		const isWholeDayBlocked = overrideList.some(
			o => (!o.available || o.available === 0) && (!o.start_time || !o.end_time)
		);
		if (isWholeDayBlocked) {
			await env.KV.put(cacheKey, JSON.stringify({ slots: [] }), { expirationTtl: 300 });
			return json({ slots: [] });
		}

		// Parse date
		const requestedDate = new Date(date);
		const dayOfWeek = requestedDate.getDay();

		// Get availability rules for this day:
		// Filter by is_active = 1 AND (event_type_id IS NULL OR event_type_id = ?)
		const availabilityRules = await db
			.prepare(
				`SELECT event_type_id, start_time, end_time
				FROM availability_rules
				WHERE user_id = ? AND day_of_week = ? AND is_active = 1 AND (event_type_id IS NULL OR event_type_id = ?)
				ORDER BY start_time`
			)
			.bind(user.id, dayOfWeek, eventType.id)
			.all<{ event_type_id: string | null; start_time: string; end_time: string }>();

		// If event-specific rules exist for that event_type_id, prefer them over global (event_type_id IS NULL) rules
		const eventSpecificRules = (availabilityRules.results || []).filter(r => r.event_type_id === eventType.id);
		const dayRules = eventSpecificRules.length > 0
			? eventSpecificRules
			: (availabilityRules.results || []).filter(r => r.event_type_id === null);

		// Determine effective working windows for this date:
		// If custom available overrides exist (available = 1 with start & end times), prefer them over recurring weekly rules
		const availableCustomOverrides = overrideList.filter(
			o => (o.available === 1 || o.available === true) && o.start_time && o.end_time
		);

		let workingWindows: Array<{ start_time: string; end_time: string }> = [];
		if (availableCustomOverrides.length > 0) {
			workingWindows = availableCustomOverrides.map(o => ({
				start_time: o.start_time!,
				end_time: o.end_time!
			}));
		} else {
			workingWindows = dayRules.map(r => ({
				start_time: r.start_time,
				end_time: r.end_time
			}));
		}

		if (workingWindows.length === 0) {
			await env.KV.put(cacheKey, JSON.stringify({ slots: [] }), { expirationTtl: 300 });
			return json({ slots: [] });
		}

		// Blocked interval overrides on this date (available = 0 with start and end times)
		const blockedOverrideSlots: TimeSlot[] = overrideList
			.filter(o => (!o.available || o.available === 0) && o.start_time && o.end_time)
			.map(o => ({
				start: createDateInTimezone(date, o.start_time!, userTimezone).toISOString(),
				end: createDateInTimezone(date, o.end_time!, userTimezone).toISOString()
			}));

		// Get calendar settings: use event type override if set, otherwise use global settings
		const availabilityCalendars = eventType.availability_calendars || userSettings.defaultAvailabilityCalendars || 'both';
		const useGoogleCalendar = availabilityCalendars === 'google' || availabilityCalendars === 'both';
		const useOutlookCalendar = availabilityCalendars === 'outlook' || availabilityCalendars === 'both';

		// Get busy times from connected calendars
		const startOfDay = new Date(requestedDate);
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date(requestedDate);
		endOfDay.setHours(23, 59, 59, 999);

		let busySlots: TimeSlot[] = [];

		// Fetch Google Calendar busy times (if enabled in settings)
		if (useGoogleCalendar) {
			try {
				const accessToken = await getValidAccessToken(
					db,
					user.id,
					env.GOOGLE_CLIENT_ID,
					env.GOOGLE_CLIENT_SECRET
				);
				// Use selected calendars if configured, otherwise query all
				const selectedCalendars = userSettings.selectedGoogleCalendars;
				const googleBusy = await getBusyTimes(accessToken, startOfDay, endOfDay, selectedCalendars);
				busySlots.push(...googleBusy);
			} catch (err) {
				console.error('Error fetching Google Calendar busy times:', err);
				// Continue without Google Calendar data if there's an error
			}
		}

		// Fetch Outlook Calendar busy times (if configured, connected, and enabled in settings)
		if (useOutlookCalendar && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					user.id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);
				const outlookBusy = await getOutlookBusyTimes(outlookToken, startOfDay, endOfDay);
				busySlots.push(...outlookBusy);
			} catch (err) {
				// User may not have Outlook connected - that's fine
				console.error('Error fetching Outlook Calendar busy times:', err);
			}
		}

		// Get existing bookings for this date
		const bookings = await db
			.prepare(
				`SELECT start_time, end_time
				FROM bookings
				WHERE user_id = ? AND DATE(start_time) = ? AND status = 'confirmed'
				ORDER BY start_time`
			)
			.bind(user.id, date)
			.all<{ start_time: string; end_time: string }>();

		// Query confirmed room bookings across the organization for this date to prevent room conflicts
		let roomBusySlots: Array<{ start: string; end: string }> = [];
		if (eventType.meeting_room_id) {
			const roomBookings = await db
				.prepare(
					`SELECT start_time, end_time
					FROM bookings
					WHERE meeting_room_id = ? AND DATE(start_time) = ? AND status = 'confirmed'
					ORDER BY start_time`
				)
				.bind(eventType.meeting_room_id, date)
				.all<{ start_time: string; end_time: string }>();

			roomBusySlots = (roomBookings.results || []).map(b => ({
				start: b.start_time,
				end: b.end_time
			}));
		}

		// Combine busy slots from Google Calendar, Outlook Calendar, host bookings, room bookings, and blocked overrides
		const allBusySlots = [
			...busySlots.map(slot => ({
				start: slot.start,
				end: slot.end
			})),
			...bookings.results.map(booking => ({
				start: booking.start_time,
				end: booking.end_time
			})),
			...roomBusySlots,
			...blockedOverrideSlots
		];

		// Generate available slots
		const slots: TimeSlot[] = [];
		const bufferMinutes = eventType.buffer_minutes || 0;
		const bufferMs = bufferMinutes * 60 * 1000;

		for (const rule of workingWindows) {
			// Create start and end times in user's timezone, converted to UTC
			let currentTime = createDateInTimezone(date, rule.start_time, userTimezone);
			const endTime = createDateInTimezone(date, rule.end_time, userTimezone);

			// Generate slots every 30 minutes (or event duration, whichever is smaller)
			const slotIncrement = Math.min(30, eventType.duration);

			while (currentTime < endTime) {
				const slotEnd = new Date(currentTime);
				slotEnd.setMinutes(slotEnd.getMinutes() + eventType.duration);

				// Check if slot end is within availability window
				if (slotEnd > endTime) {
					break;
				}

				// Check if slot is in the past
				if (currentTime < new Date()) {
					currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
					continue;
				}

				// Check if slot conflicts with any busy time, respecting buffer_minutes
				const hasConflict = allBusySlots.some(busy => {
					const busyStart = new Date(new Date(busy.start).getTime() - bufferMs);
					const busyEnd = new Date(new Date(busy.end).getTime() + bufferMs);
					return currentTime < busyEnd && slotEnd > busyStart;
				});

				if (!hasConflict) {
					slots.push({
						start: currentTime.toISOString(),
						end: slotEnd.toISOString()
					});
				}

				currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
			}
		}

		// Cache response in KV for 5 minutes
		await env.KV.put(cacheKey, JSON.stringify({ slots }), { expirationTtl: 300 });

		return json({ slots });
	} catch (err: any) {
		console.error('Availability API error:', err);
		if (err?.status) throw err; // Re-throw SvelteKit errors
		throw error(500, 'Failed to fetch availability');
	}
};
