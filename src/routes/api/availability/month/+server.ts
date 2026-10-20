/**
 * Monthly availability API endpoint
 * Returns which dates in a month have available slots
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
	const month = url.searchParams.get('month'); // YYYY-MM
	const userIdParam = url.searchParams.get('userId');
	const userSlugParam = url.searchParams.get('user') || url.searchParams.get('userSlug');

	if (!eventSlug || !month) {
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
		const cacheKey = `availability:month:${user.id}:${eventSlug}:${month}`;
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

		// Parse user settings for global calendar defaults
		let userSettings: { defaultAvailabilityCalendars?: string; selectedGoogleCalendars?: string[] } = {};
		try {
			userSettings = user.settings ? JSON.parse(user.settings) : {};
		} catch {
			userSettings = {};
		}

		// Helper to create a Date in user's timezone
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

		const eventType = await db
			.prepare('SELECT id, duration_minutes as duration, buffer_minutes, availability_calendars, meeting_room_id FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1')
			.bind(user.id, eventSlug)
			.first<{ id: string; duration: number; buffer_minutes: number | null; availability_calendars: string | null; meeting_room_id: string | null }>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		// Get calendar settings: use event type override if set, otherwise use global settings
		const availabilityCalendars = eventType.availability_calendars || userSettings.defaultAvailabilityCalendars || 'both';
		const useGoogleCalendar = availabilityCalendars === 'google' || availabilityCalendars === 'both';
		const useOutlookCalendar = availabilityCalendars === 'outlook' || availabilityCalendars === 'both';

		// Get availability rules for this user:
		// Filter by is_active = 1 AND (event_type_id IS NULL OR event_type_id = ?)
		const allRules = await db
			.prepare(
				`SELECT event_type_id, day_of_week, start_time, end_time
				FROM availability_rules
				WHERE user_id = ? AND is_active = 1 AND (event_type_id IS NULL OR event_type_id = ?)
				ORDER BY day_of_week, start_time`
			)
			.bind(user.id, eventType.id)
			.all<{ event_type_id: string | null; day_of_week: number; start_time: string; end_time: string }>();

		// Group rules by day of week, preferring event-specific rules over global rules
		const rulesByDay = new Map<number, Array<{ start_time: string; end_time: string }>>();
		for (let d = 0; d <= 6; d++) {
			const dayEventRules = (allRules.results || []).filter(r => r.day_of_week === d && r.event_type_id === eventType.id);
			if (dayEventRules.length > 0) {
				rulesByDay.set(d, dayEventRules.map(r => ({ start_time: r.start_time, end_time: r.end_time })));
			} else {
				const dayGlobalRules = (allRules.results || []).filter(r => r.day_of_week === d && r.event_type_id === null);
				if (dayGlobalRules.length > 0) {
					rulesByDay.set(d, dayGlobalRules.map(r => ({ start_time: r.start_time, end_time: r.end_time })));
				}
			}
		}

		// Parse month to get date range
		const [year, monthNum] = month.split('-').map(Number);
		const firstDay = new Date(year, monthNum - 1, 1);
		const lastDay = new Date(year, monthNum, 0);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Query availability overrides for this month
		const firstDayStr = `${year}-${String(monthNum).padStart(2, '0')}-01`;
		const lastDayStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

		const monthOverrides = await db
			.prepare(
				`SELECT date, available, start_time, end_time
				FROM availability_overrides
				WHERE user_id = ? AND date >= ? AND date <= ?
				ORDER BY date, start_time`
			)
			.bind(user.id, firstDayStr, lastDayStr)
			.all<{ date: string; available: number | boolean; start_time: string | null; end_time: string | null }>();

		const overridesByDate = new Map<string, Array<{ available: number | boolean; start_time: string | null; end_time: string | null }>>();
		for (const override of monthOverrides.results || []) {
			if (!overridesByDate.has(override.date)) {
				overridesByDate.set(override.date, []);
			}
			overridesByDate.get(override.date)!.push(override);
		}

		// Max date is 60 days from today
		const maxDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);

		// Get busy times from connected calendars for the entire month
		let busySlots: TimeSlot[] = [];

		// Fetch Google Calendar busy times (if enabled)
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
				const googleBusy = await getBusyTimes(accessToken, firstDay, lastDay, selectedCalendars);
				busySlots.push(...googleBusy);
			} catch (err) {
				console.error('Error fetching Google Calendar busy times:', err);
			}
		}

		// Fetch Outlook Calendar busy times (if enabled and configured)
		if (useOutlookCalendar && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					user.id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);
				const outlookBusy = await getOutlookBusyTimes(outlookToken, firstDay, lastDay);
				busySlots.push(...outlookBusy);
			} catch (err) {
				console.error('Error fetching Outlook Calendar busy times:', err);
			}
		}

		// Get existing bookings for this month
		const bookings = await db
			.prepare(
				`SELECT start_time, end_time
				FROM bookings
				WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'confirmed'
				ORDER BY start_time`
			)
			.bind(user.id, firstDay.toISOString(), lastDay.toISOString())
			.all<{ start_time: string; end_time: string }>();

		// Query confirmed room bookings across the organization for this month to prevent room conflicts
		let roomBusySlots: Array<{ start: string; end: string }> = [];
		if (eventType.meeting_room_id) {
			const roomBookings = await db
				.prepare(
					`SELECT start_time, end_time
					FROM bookings
					WHERE meeting_room_id = ? AND start_time >= ? AND start_time <= ? AND status = 'confirmed'
					ORDER BY start_time`
				)
				.bind(eventType.meeting_room_id, firstDay.toISOString(), lastDay.toISOString())
				.all<{ start_time: string; end_time: string }>();

			roomBusySlots = (roomBookings.results || []).map(b => ({
				start: b.start_time,
				end: b.end_time
			}));
		}

		// Combine all busy slots from connected calendars, existing host bookings, and room bookings
		const allBusySlots = [
			...busySlots,
			...bookings.results.map(b => ({ start: b.start_time, end: b.end_time })),
			...roomBusySlots
		];

		// Check each day in the month
		const availableDates: string[] = [];
		const bufferMinutes = eventType.buffer_minutes || 0;
		const bufferMs = bufferMinutes * 60 * 1000;

		for (let day = 1; day <= lastDay.getDate(); day++) {
			const date = new Date(year, monthNum - 1, day);

			// Skip dates before today or after maxDate
			if (date < today || date > maxDate) continue;

			const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			if (dateStr <= tomorrowStr) continue;
			const dayOfWeek = date.getDay();
			const dateOverrides = overridesByDate.get(dateStr) || [];

			// If an override has available = 0 without start/end times, treat the whole date as unavailable
			const isWholeDayBlocked = dateOverrides.some(
				o => (!o.available || o.available === 0) && (!o.start_time || !o.end_time)
			);
			if (isWholeDayBlocked) continue;

			// Check for custom available hours (available = 1 with start & end times)
			const availableCustomOverrides = dateOverrides.filter(
				o => (o.available === 1 || o.available === true) && o.start_time && o.end_time
			);

			let dayRules: Array<{ start_time: string; end_time: string }> = [];
			if (availableCustomOverrides.length > 0) {
				dayRules = availableCustomOverrides.map(o => ({
					start_time: o.start_time!,
					end_time: o.end_time!
				}));
			} else {
				dayRules = rulesByDay.get(dayOfWeek) || [];
			}

			// No availability rules or working windows for this day
			if (dayRules.length === 0) continue;

			// Blocked interval overrides on this date
			const dayBlockedOverrides: TimeSlot[] = dateOverrides
				.filter(o => (!o.available || o.available === 0) && o.start_time && o.end_time)
				.map(o => ({
					start: createDateInTimezone(dateStr, o.start_time!, userTimezone).toISOString(),
					end: createDateInTimezone(dateStr, o.end_time!, userTimezone).toISOString()
				}));

			// Check if at least one slot is available
			let hasAvailableSlot = false;

			for (const rule of dayRules) {
				if (hasAvailableSlot) break;

				// Create start and end times in user's timezone, converted to UTC
				let currentTime = createDateInTimezone(dateStr, rule.start_time, userTimezone);
				const endTime = createDateInTimezone(dateStr, rule.end_time, userTimezone);

				const slotIncrement = Math.min(30, eventType.duration);

				while (currentTime < endTime && !hasAvailableSlot) {
					const slotEnd = new Date(currentTime);
					slotEnd.setMinutes(slotEnd.getMinutes() + eventType.duration);

					if (slotEnd > endTime) break;
					if (currentTime < new Date()) {
						currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
						continue;
					}

					// Check conflicts against allBusySlots and dayBlockedOverrides, respecting buffer_minutes
					const hasConflict =
						allBusySlots.some(busy => {
							const busyStart = new Date(new Date(busy.start).getTime() - bufferMs);
							const busyEnd = new Date(new Date(busy.end).getTime() + bufferMs);
							return currentTime < busyEnd && slotEnd > busyStart;
						}) ||
						dayBlockedOverrides.some(busy => {
							const busyStart = new Date(new Date(busy.start).getTime() - bufferMs);
							const busyEnd = new Date(new Date(busy.end).getTime() + bufferMs);
							return currentTime < busyEnd && slotEnd > busyStart;
						});

					if (!hasConflict) {
						hasAvailableSlot = true;
					}

					currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
				}
			}

			if (hasAvailableSlot) {
				availableDates.push(dateStr);
			}
		}

		// Cache response in KV for 5 minutes
		await env.KV.put(cacheKey, JSON.stringify({ availableDates }), { expirationTtl: 300 });

		return json({ availableDates });
	} catch (err: any) {
		console.error('Monthly availability API error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to fetch monthly availability');
	}
};
