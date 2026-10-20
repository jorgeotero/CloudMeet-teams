/**
 * Reschedule Booking API endpoint
 * Reschedules a booking to a new time slot without requiring attendee to re-enter details
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCalendarEvent, cancelCalendarEvent, getValidAccessToken } from '$lib/server/google-calendar';
import { createOutlookCalendarEvent, cancelOutlookCalendarEvent, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';
import { sendRescheduleEmail, sendAdminRescheduleNotification, getEmailTemplates, isEmailEnabled } from '$lib/server/email';
import { invalidateAvailabilityCache } from '$lib/cache/kv-cache';
import { queueWebhookEvent } from '$lib/server/webhooks';

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	try {
		const body = await request.json() as {
			bookingId: string;
			newStartTime: string;
			newEndTime: string;
			timezone?: string;
		};
		const { bookingId, newStartTime, newEndTime, timezone } = body;

		// Validate required fields
		if (!bookingId || !newStartTime || !newEndTime) {
			throw error(400, 'Missing required fields');
		}

		const db = env.DB;

		// Get the original booking with all details
		const originalBooking = await db
			.prepare(
				`SELECT b.id, b.user_id, b.event_type_id, b.meeting_room_id, b.start_time, b.end_time,
				b.attendee_name, b.attendee_email, b.attendee_phone, b.attendee_notes,
				b.external_ref, b.metadata, b.google_event_id, b.outlook_event_id,
				e.name as event_name, e.slug as event_slug, e.description as event_description,
				e.duration_minutes as duration, e.buffer_minutes,
				u.id as host_user_id, u.name as host_name, u.email as host_email,
				u.contact_email, u.settings, u.brand_color, u.outlook_refresh_token
				FROM bookings b
				JOIN event_types e ON b.event_type_id = e.id
				JOIN users u ON b.user_id = u.id
				WHERE b.id = ? AND b.status IN ('confirmed', 'rescheduled')`
			)
			.bind(bookingId)
			.first<{
				id: string;
				user_id: string;
				event_type_id: string;
				meeting_room_id: string | null;
				start_time: string;
				end_time: string;
				attendee_name: string;
				attendee_email: string;
				attendee_phone: string | null;
				attendee_notes: string | null;
				external_ref: string | null;
				metadata: string | null;
				google_event_id: string | null;
				outlook_event_id: string | null;
				event_name: string;
				event_slug: string;
				event_description: string | null;
				duration: number;
				buffer_minutes: number | null;
				host_user_id: string;
				host_name: string;
				host_email: string;
				contact_email: string | null;
				settings: string | null;
				brand_color: string | null;
				outlook_refresh_token: string | null;
			}>();

		if (!originalBooking) {
			throw error(404, 'Booking not found or already cancelled');
		}

		const newStartDateTime = new Date(newStartTime);
		const newEndDateTime = new Date(newEndTime);
		const oldStartDateTime = new Date(originalBooking.start_time);
		const oldEndDateTime = new Date(originalBooking.end_time);

		// Check for conflicts with existing bookings (excluding the original booking), respecting buffer_minutes
		const bufferMinutes = originalBooking.buffer_minutes || 0;
		const bufferMs = bufferMinutes * 60 * 1000;
		const bufferedStartTime = new Date(newStartDateTime.getTime() - bufferMs).toISOString();
		const bufferedEndTime = new Date(newEndDateTime.getTime() + bufferMs).toISOString();

		const conflict = await db
			.prepare(
				`SELECT id FROM bookings
				WHERE user_id = ? AND status = 'confirmed' AND id != ?
				AND start_time < ? AND end_time > ?`
			)
			.bind(
				originalBooking.user_id,
				bookingId,
				bufferedEndTime,
				bufferedStartTime
			)
			.first();

		if (conflict) {
			throw error(409, 'This time slot is no longer available');
		}

		// Check room conflict if booking has an assigned meeting room
		if (originalBooking.meeting_room_id) {
			const roomConflict = await db
				.prepare(
					`SELECT id FROM bookings
					WHERE meeting_room_id = ? AND status = 'confirmed' AND id != ?
					AND start_time < ? AND end_time > ?`
				)
				.bind(
					originalBooking.meeting_room_id,
					bookingId,
					bufferedEndTime,
					bufferedStartTime
				)
				.first();

			if (roomConflict) {
				throw error(409, 'The meeting room is no longer available for this time slot');
			}
		}

		let newCalendarEventId: string | null = null;
		let newOutlookEventId: string | null = null;
		let newMeetingUrl: string | null = null;

		// Cancel old Google Calendar event and create new one if Google was used
		if (originalBooking.google_event_id) {
			try {
				const accessToken = await getValidAccessToken(
					db,
					originalBooking.user_id,
					env.GOOGLE_CLIENT_ID,
					env.GOOGLE_CLIENT_SECRET
				);

				// Cancel old calendar event if it exists
				try {
					await cancelCalendarEvent(accessToken, originalBooking.google_event_id);
				} catch (err) {
					console.error('Error cancelling old Google Calendar event:', err);
				}

				// Create new calendar event
				const notes = originalBooking.attendee_notes;
				const calendarEvent = await createCalendarEvent(accessToken, {
					summary: `${originalBooking.event_name} with ${originalBooking.attendee_name}`,
					description: `${originalBooking.event_description || ''}\n\nAttendee: ${originalBooking.attendee_name} (${originalBooking.attendee_email})${notes ? `\n\nNotes from attendee:\n${notes}` : ''}`,
					start: {
						dateTime: newStartDateTime.toISOString(),
						timeZone: 'UTC'
					},
					end: {
						dateTime: newEndDateTime.toISOString(),
						timeZone: 'UTC'
					},
					attendees: [
						{ email: originalBooking.attendee_email }
					],
					conferenceData: {
						createRequest: {
							requestId: crypto.randomUUID(),
							conferenceSolutionKey: { type: 'hangoutsMeet' }
						}
					}
				});

				newCalendarEventId = calendarEvent.id;
				newMeetingUrl = calendarEvent.hangoutLink || calendarEvent.htmlLink || null;
			} catch (err) {
				console.error('Error with Google Calendar:', err);
			}
		}

		// Cancel old Outlook Calendar event and create new one if Outlook was used
		if (originalBooking.outlook_event_id && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					originalBooking.user_id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);

				// Cancel old Outlook event if it exists
				try {
					await cancelOutlookCalendarEvent(outlookToken, originalBooking.outlook_event_id);
				} catch (err) {
					console.error('Error cancelling old Outlook Calendar event:', err);
				}

				// Create new Outlook event
				const notes = originalBooking.attendee_notes;
				const outlookEvent = await createOutlookCalendarEvent(outlookToken, {
					summary: `${originalBooking.event_name} with ${originalBooking.attendee_name}`,
					description: `${originalBooking.event_description || ''}\n\nAttendee: ${originalBooking.attendee_name} (${originalBooking.attendee_email})${notes ? `\n\nNotes from attendee:\n${notes}` : ''}`,
					startTime: newStartDateTime.toISOString(),
					endTime: newEndDateTime.toISOString(),
					attendeeEmail: originalBooking.attendee_email,
					hostEmail: originalBooking.host_email,
					createTeamsMeeting: true
				});

				newOutlookEventId = outlookEvent.id;
				if (outlookEvent.onlineMeeting?.joinUrl) {
					newMeetingUrl = outlookEvent.onlineMeeting.joinUrl;
				}
			} catch (err) {
				console.error('Error with Outlook Calendar:', err);
			}
		}

		// Update the booking with new times (keeping attendee info) and set status to confirmed
		await db
			.prepare(
				`UPDATE bookings SET
					start_time = ?,
					end_time = ?,
					google_event_id = ?,
					outlook_event_id = ?,
					meeting_url = ?,
					status = 'confirmed'
				WHERE id = ?`
			)
			.bind(
				newStartTime,
				newEndTime,
				newCalendarEventId,
				newOutlookEventId,
				newMeetingUrl,
				bookingId
			)
			.run();

		// Mark any pending reschedule proposals for this booking as superseded
		await db
			.prepare(`UPDATE reschedule_proposals SET status = 'counter_proposed', responded_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND status = 'pending'`)
			.bind(bookingId)
			.run();

		// Cancel any old scheduled reminder emails and create new ones
		await db
			.prepare(`UPDATE scheduled_emails SET status = 'cancelled' WHERE booking_id = ? AND status = 'pending'`)
			.bind(bookingId)
			.run();

		// Invalidate availability cache for both old and new dates (daily and monthly)
		await invalidateAvailabilityCache(env.KV, originalBooking.user_id, originalBooking.event_slug, originalBooking.start_time);
		await invalidateAvailabilityCache(env.KV, originalBooking.user_id, originalBooking.event_slug, newStartTime);

		// Send reschedule email (not cancellation email!)
		if (env.EMAILIT_API_KEY) {
			try {
				// Parse user settings for time format
				let timeFormat: '12h' | '24h' = '12h';
				try {
					const settings = originalBooking.settings ? JSON.parse(originalBooking.settings) : {};
					timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
				} catch {
					// Keep default
				}

				const replyToEmail = originalBooking.contact_email || originalBooking.host_email;
				const templates = await getEmailTemplates(db, originalBooking.user_id);

				// Check if reschedule email template is enabled (default to true)
				if (isEmailEnabled(templates, 'reschedule')) {
					const template = templates.get('reschedule');
					await sendRescheduleEmail(
						{
							attendeeName: originalBooking.attendee_name,
							attendeeEmail: originalBooking.attendee_email,
							eventName: originalBooking.event_name,
							eventDescription: originalBooking.event_description || '',
							startTime: newStartDateTime,
							endTime: newEndDateTime,
							oldStartTime: oldStartDateTime,
							oldEndTime: oldEndDateTime,
							meetingUrl: newMeetingUrl,
							bookingId: originalBooking.id,
							hostName: originalBooking.host_name,
							hostEmail: originalBooking.host_email,
							hostContactEmail: originalBooking.contact_email || undefined,
							appUrl: env.APP_URL || '',
							timeFormat,
							timezone: timezone || 'UTC',
							brandColor: originalBooking.brand_color || undefined,
							attendeeNotes: originalBooking.attendee_notes
						},
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || originalBooking.host_email,
							replyTo: replyToEmail
						},
						template?.subject || undefined
					);
				}

				// Send admin notification
				try {
					await sendAdminRescheduleNotification(
						{
							attendeeName: originalBooking.attendee_name,
							attendeeEmail: originalBooking.attendee_email,
							eventName: originalBooking.event_name,
							eventDescription: originalBooking.event_description || '',
							startTime: newStartDateTime,
							endTime: newEndDateTime,
							oldStartTime: oldStartDateTime,
							oldEndTime: oldEndDateTime,
							meetingUrl: newMeetingUrl,
							bookingId: originalBooking.id,
							hostName: originalBooking.host_name,
							hostEmail: originalBooking.host_email,
							appUrl: env.APP_URL || '',
							timeFormat,
							timezone: timezone || 'UTC',
							brandColor: originalBooking.brand_color || undefined,
							attendeeNotes: originalBooking.attendee_notes
						},
						originalBooking.host_email,
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || originalBooking.host_email
						}
					);
				} catch (adminEmailErr) {
					console.error('Failed to send admin reschedule notification:', adminEmailErr);
				}

				// Schedule new reminder emails
				const reminderTypes = ['reminder_24h', 'reminder_1h'] as const;
				const reminderOffsets: Record<string, number> = {
					'reminder_24h': 24 * 60 * 60 * 1000,
					'reminder_1h': 60 * 60 * 1000
				};

				for (const reminderType of reminderTypes) {
					if (isEmailEnabled(templates, reminderType)) {
						const scheduledFor = new Date(newStartDateTime.getTime() - reminderOffsets[reminderType]);
						if (scheduledFor > new Date()) {
							await db
								.prepare(`INSERT INTO scheduled_emails (booking_id, template_type, scheduled_for) VALUES (?, ?, ?)`)
								.bind(bookingId, reminderType, scheduledFor.toISOString())
								.run();
						}
					}
				}
			} catch (emailError) {
				console.error('Failed to send reschedule email:', emailError);
			}
		}

		// Dispatch booking.rescheduled webhook event
		queueWebhookEvent(platform, db, originalBooking.user_id, 'booking.rescheduled', {
			id: originalBooking.id,
			event_type_id: originalBooking.event_type_id,
			event_slug: originalBooking.event_slug,
			user_id: originalBooking.user_id,
			host_email: originalBooking.host_email,
			start_time: newStartTime,
			end_time: newEndTime,
			old_start_time: originalBooking.start_time,
			old_end_time: originalBooking.end_time,
			attendee_name: originalBooking.attendee_name,
			attendee_email: originalBooking.attendee_email,
			attendee_phone: originalBooking.attendee_phone,
			attendee_notes: originalBooking.attendee_notes,
			external_ref: originalBooking.external_ref,
			metadata: originalBooking.metadata,
			meeting_url: newMeetingUrl,
			status: 'rescheduled'
		});

		return json({
			success: true,
			bookingId,
			meetingUrl: newMeetingUrl
		});
	} catch (err: any) {
		console.error('Reschedule error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to reschedule booking');
	}
};
