/**
 * Reschedule proposal response page
 * Allows attendee to accept, decline, or counter-propose
 */

import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createCalendarEvent, cancelCalendarEvent, getValidAccessToken } from '$lib/server/google-calendar';
import { createOutlookCalendarEvent, cancelOutlookCalendarEvent, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';
import { sendAdminRescheduleNotification, sendAdminCancellationNotification } from '$lib/server/email';
import { invalidateAvailabilityCache } from '$lib/cache/kv-cache';
import { queueWebhookEvent } from '$lib/server/webhooks';

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const token = params.token;
	const action = url.searchParams.get('action');

	// Get the proposal
	const proposal = await db
		.prepare(
			`SELECT p.id, p.booking_id, p.proposed_start_time, p.proposed_end_time, p.message, p.status, p.proposed_by,
			b.attendee_name, b.attendee_email, b.start_time as original_start_time, b.end_time as original_end_time,
			b.google_event_id, b.attendee_notes,
			e.name as event_name, e.slug as event_slug, e.duration_minutes,
			u.id as user_id, u.name as host_name, u.email as host_email, u.brand_color, u.settings
			FROM reschedule_proposals p
			JOIN bookings b ON p.booking_id = b.id
			JOIN event_types e ON b.event_type_id = e.id
			JOIN users u ON b.user_id = u.id
			WHERE p.response_token = ?`
		)
		.bind(token)
		.first<{
			id: string;
			booking_id: string;
			proposed_start_time: string;
			proposed_end_time: string;
			message: string | null;
			status: string;
			proposed_by: string;
			attendee_name: string;
			attendee_email: string;
			original_start_time: string;
			original_end_time: string;
			google_event_id: string | null;
			attendee_notes: string | null;
			event_name: string;
			event_slug: string;
			duration_minutes: number;
			user_id: string;
			host_name: string;
			host_email: string;
			brand_color: string | null;
			settings: string | null;
		}>();

	if (!proposal) {
		throw error(404, 'Reschedule proposal not found or has expired');
	}

	if (proposal.status !== 'pending') {
		return {
			proposal,
			alreadyResponded: true,
			action
		};
	}

	return {
		proposal,
		alreadyResponded: false,
		action
	};
};

export const actions: Actions = {
	accept: async ({ params, platform }) => {
		const db = platform?.env?.DB;
		const env = platform?.env;
		if (!db || !env) {
			return fail(500, { error: 'Database not available' });
		}

		const token = params.token;

		try {
			// Get proposal details
			const proposal = await db
				.prepare(
					`SELECT p.id, p.booking_id, p.proposed_start_time, p.proposed_end_time, p.status,
					b.attendee_name, b.attendee_email, b.attendee_phone, b.attendee_notes, b.external_ref, b.metadata,
					b.google_event_id, b.outlook_event_id,
					b.start_time as original_start_time, b.end_time as original_end_time,
					e.id as event_type_id, e.name as event_name, e.slug as event_slug, e.description as event_description, e.duration_minutes,
					u.id as user_id, u.name as host_name, u.email as host_email, u.contact_email, u.brand_color, u.settings, u.outlook_refresh_token
					FROM reschedule_proposals p
					JOIN bookings b ON p.booking_id = b.id
					JOIN event_types e ON b.event_type_id = e.id
					JOIN users u ON b.user_id = u.id
					WHERE p.response_token = ?`
				)
				.bind(token)
				.first<{
					id: string;
					booking_id: string;
					proposed_start_time: string;
					proposed_end_time: string;
					status: string;
					attendee_name: string;
					attendee_email: string;
					attendee_phone: string | null;
					attendee_notes: string | null;
					external_ref: string | null;
					metadata: string | null;
					google_event_id: string | null;
					outlook_event_id: string | null;
					original_start_time: string;
					original_end_time: string;
					event_type_id: string;
					event_name: string;
					event_slug: string;
					event_description: string | null;
					duration_minutes: number;
					user_id: string;
					host_name: string;
					host_email: string;
					contact_email: string | null;
					brand_color: string | null;
					settings: string | null;
					outlook_refresh_token: string | null;
				}>();

			if (!proposal || proposal.status !== 'pending') {
				return fail(400, { error: 'Proposal already responded to or expired' });
			}

			let newMeetingUrl: string | null = null;
			let newGoogleEventId: string | null = null;
			let newOutlookEventId: string | null = null;

			// Handle Google Calendar if original booking used Google
			if (proposal.google_event_id) {
				try {
					const accessToken = await getValidAccessToken(
						db,
						proposal.user_id,
						env.GOOGLE_CLIENT_ID,
						env.GOOGLE_CLIENT_SECRET
					);

					// Cancel old Google Calendar event
					try {
						await cancelCalendarEvent(accessToken, proposal.google_event_id);
					} catch (err) {
						console.error('Failed to cancel old calendar event:', err);
					}

					// Create new Google Calendar event
					const calendarEvent = await createCalendarEvent(accessToken, {
						summary: `${proposal.event_name} with ${proposal.attendee_name}`,
						description: `${proposal.event_description || ''}\n\nAttendee: ${proposal.attendee_name} (${proposal.attendee_email})${proposal.attendee_notes ? `\n\nNotes from attendee:\n${proposal.attendee_notes}` : ''}`,
						start: {
							dateTime: new Date(proposal.proposed_start_time).toISOString(),
							timeZone: 'UTC'
						},
						end: {
							dateTime: new Date(proposal.proposed_end_time).toISOString(),
							timeZone: 'UTC'
						},
						attendees: [
							{ email: proposal.attendee_email }
						],
						conferenceData: {
							createRequest: {
								requestId: crypto.randomUUID(),
								conferenceSolutionKey: { type: 'hangoutsMeet' }
							}
						}
					});

					newGoogleEventId = calendarEvent.id;
					newMeetingUrl = calendarEvent.hangoutLink || calendarEvent.htmlLink || null;
				} catch (err) {
					console.error('Failed to handle Google calendar event in reschedule response:', err);
				}
			}

			// Handle Outlook Calendar if original booking used Outlook
			if (proposal.outlook_event_id && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
				try {
					const outlookToken = await getValidOutlookAccessToken(
						db,
						proposal.user_id,
						env.MICROSOFT_CLIENT_ID,
						env.MICROSOFT_CLIENT_SECRET
					);

					// Cancel old Outlook event
					try {
						await cancelOutlookCalendarEvent(outlookToken, proposal.outlook_event_id);
					} catch (err) {
						console.error('Failed to cancel old Outlook calendar event:', err);
					}

					// Create new Outlook event
					const notes = proposal.attendee_notes;
					const outlookEvent = await createOutlookCalendarEvent(outlookToken, {
						summary: `${proposal.event_name} with ${proposal.attendee_name}`,
						description: `${proposal.event_description || ''}\n\nAttendee: ${proposal.attendee_name} (${proposal.attendee_email})${notes ? `\n\nNotes from attendee:\n${notes}` : ''}`,
						startTime: new Date(proposal.proposed_start_time).toISOString(),
						endTime: new Date(proposal.proposed_end_time).toISOString(),
						attendeeEmail: proposal.attendee_email,
						hostEmail: proposal.host_email,
						createTeamsMeeting: true
					});

					newOutlookEventId = outlookEvent.id;
					if (outlookEvent.onlineMeeting?.joinUrl) {
						newMeetingUrl = outlookEvent.onlineMeeting.joinUrl;
					}
				} catch (err) {
					console.error('Failed to handle Outlook calendar event in reschedule response:', err);
				}
			}

			// Update the original booking with new times
			await db
				.prepare(
					`UPDATE bookings
					SET start_time = ?, end_time = ?, status = 'confirmed', google_event_id = ?, outlook_event_id = ?, meeting_url = ?
					WHERE id = ?`
				)
				.bind(
					proposal.proposed_start_time,
					proposal.proposed_end_time,
					newGoogleEventId,
					newOutlookEventId,
					newMeetingUrl,
					proposal.booking_id
				)
				.run();

			// Update proposal status
			await db
				.prepare(`UPDATE reschedule_proposals SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = ?`)
				.bind(proposal.id)
				.run();

			// Invalidate availability cache for both old and new dates (daily and monthly)
			await invalidateAvailabilityCache(env.KV, proposal.user_id, proposal.event_slug, proposal.original_start_time);
			await invalidateAvailabilityCache(env.KV, proposal.user_id, proposal.event_slug, proposal.proposed_start_time);

			// Dispatch booking.rescheduled webhook event
			queueWebhookEvent(platform, db, proposal.user_id, 'booking.rescheduled', {
				id: proposal.booking_id,
				event_type_id: proposal.event_type_id,
				event_slug: proposal.event_slug,
				user_id: proposal.user_id,
				host_email: proposal.host_email,
				start_time: proposal.proposed_start_time,
				end_time: proposal.proposed_end_time,
				old_start_time: proposal.original_start_time,
				old_end_time: proposal.original_end_time,
				attendee_name: proposal.attendee_name,
				attendee_email: proposal.attendee_email,
				attendee_phone: proposal.attendee_phone,
				attendee_notes: proposal.attendee_notes,
				external_ref: proposal.external_ref,
				metadata: proposal.metadata,
				meeting_url: newMeetingUrl,
				status: 'rescheduled'
			});

			// Send admin notification about accepted reschedule
			if (env.EMAILIT_API_KEY) {
				try {
					// Parse user settings for time format
					let timeFormat: '12h' | '24h' = '12h';
					try {
						const settings = proposal.settings ? JSON.parse(proposal.settings) : {};
						timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
					} catch {
						// Keep default
					}

					await sendAdminRescheduleNotification(
						{
							attendeeName: proposal.attendee_name,
							attendeeEmail: proposal.attendee_email,
							eventName: proposal.event_name,
							eventDescription: proposal.event_description || '',
							startTime: new Date(proposal.proposed_start_time),
							endTime: new Date(proposal.proposed_end_time),
							oldStartTime: new Date(proposal.original_start_time),
							oldEndTime: new Date(proposal.original_end_time),
							meetingUrl: newMeetingUrl,
							bookingId: proposal.booking_id,
							hostName: proposal.host_name,
							hostEmail: proposal.host_email,
							appUrl: env.APP_URL || '',
							timeFormat,
							brandColor: proposal.brand_color || '#3b82f6',
							attendeeNotes: proposal.attendee_notes
						},
						proposal.host_email,
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || proposal.host_email
						}
					);
				} catch (emailErr) {
					console.error('Failed to send admin reschedule notification:', emailErr);
				}
			}

			throw redirect(303, `/reschedule-response/${token}?success=accepted`);
		} catch (err: any) {
			if (err?.status === 303) throw err;
			console.error('Accept proposal error:', err);
			return fail(500, { error: 'Failed to accept proposal' });
		}
	},

	decline: async ({ params, platform }) => {
		const db = platform?.env?.DB;
		const env = platform?.env;
		if (!db || !env) {
			return fail(500, { error: 'Database not available' });
		}

		const token = params.token;

		try {
			// Get proposal with full details for notification
			const proposal = await db
				.prepare(
					`SELECT p.id, p.booking_id, p.status, p.proposed_start_time, p.proposed_end_time,
					b.google_event_id, b.attendee_name, b.attendee_email, b.attendee_phone, b.attendee_notes,
					b.external_ref, b.metadata, b.meeting_url, b.event_type_id,
					b.start_time as original_start_time, b.end_time as original_end_time,
					e.name as event_name, e.slug as event_slug, e.description as event_description,
					u.id as user_id, u.name as host_name, u.email as host_email, u.brand_color, u.settings
					FROM reschedule_proposals p
					JOIN bookings b ON p.booking_id = b.id
					JOIN event_types e ON b.event_type_id = e.id
					JOIN users u ON b.user_id = u.id
					WHERE p.response_token = ?`
				)
				.bind(token)
				.first<{
					id: string;
					booking_id: string;
					status: string;
					proposed_start_time: string;
					proposed_end_time: string;
					google_event_id: string | null;
					attendee_name: string;
					attendee_email: string;
					attendee_phone: string | null;
					attendee_notes: string | null;
					external_ref: string | null;
					metadata: string | null;
					meeting_url: string | null;
					event_type_id: string;
					original_start_time: string;
					original_end_time: string;
					event_name: string;
					event_slug: string;
					event_description: string | null;
					user_id: string;
					host_name: string;
					host_email: string;
					brand_color: string | null;
					settings: string | null;
				}>();

			if (!proposal || proposal.status !== 'pending') {
				return fail(400, { error: 'Proposal already responded to or expired' });
			}

			// Cancel Google Calendar event if exists
			if (proposal.google_event_id) {
				try {
					const accessToken = await getValidAccessToken(
						db,
						proposal.user_id,
						env.GOOGLE_CLIENT_ID,
						env.GOOGLE_CLIENT_SECRET
					);
					await cancelCalendarEvent(accessToken, proposal.google_event_id);
				} catch (err) {
					console.error('Failed to cancel calendar event:', err);
				}
			}

			// Update booking as cancelled
			await db
				.prepare(`UPDATE bookings SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP, canceled_by = 'attendee', cancellation_reason = 'Attendee declined reschedule proposal' WHERE id = ?`)
				.bind(proposal.booking_id)
				.run();

			// Update proposal status
			await db
				.prepare(`UPDATE reschedule_proposals SET status = 'declined', responded_at = CURRENT_TIMESTAMP WHERE id = ?`)
				.bind(proposal.id)
				.run();

			// Invalidate availability cache (daily and monthly)
			await invalidateAvailabilityCache(env.KV, proposal.user_id, proposal.event_slug, proposal.original_start_time);

			// Dispatch booking.canceled webhook event
			queueWebhookEvent(platform, db, proposal.user_id, 'booking.canceled', {
				id: proposal.booking_id,
				event_type_id: proposal.event_type_id,
				event_slug: proposal.event_slug,
				user_id: proposal.user_id,
				host_email: proposal.host_email,
				start_time: proposal.original_start_time,
				end_time: proposal.original_end_time,
				attendee_name: proposal.attendee_name,
				attendee_email: proposal.attendee_email,
				attendee_phone: proposal.attendee_phone,
				attendee_notes: proposal.attendee_notes,
				external_ref: proposal.external_ref,
				metadata: proposal.metadata,
				meeting_url: proposal.meeting_url,
				status: 'canceled',
				canceled_by: 'attendee',
				cancellation_reason: 'Attendee declined reschedule proposal'
			});

			// Send admin notification about declined reschedule (meeting cancelled)
			if (env.EMAILIT_API_KEY) {
				try {
					// Parse user settings for time format
					let timeFormat: '12h' | '24h' = '12h';
					try {
						const settings = proposal.settings ? JSON.parse(proposal.settings) : {};
						timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
					} catch {
						// Keep default
					}

					await sendAdminCancellationNotification(
						{
							attendeeName: proposal.attendee_name,
							attendeeEmail: proposal.attendee_email,
							eventName: proposal.event_name,
							eventDescription: proposal.event_description || '',
							startTime: new Date(proposal.original_start_time),
							endTime: new Date(proposal.original_end_time),
							meetingUrl: null,
							bookingId: proposal.booking_id,
							hostName: proposal.host_name,
							hostEmail: proposal.host_email,
							appUrl: env.APP_URL || '',
							timeFormat,
							brandColor: proposal.brand_color || '#3b82f6',
							attendeeNotes: proposal.attendee_notes,
							customMessage: 'Attendee declined the reschedule proposal and cancelled the meeting.'
						},
						proposal.host_email,
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || proposal.host_email
						}
					);
				} catch (emailErr) {
					console.error('Failed to send admin cancellation notification:', emailErr);
				}
			}

			throw redirect(303, `/reschedule-response/${token}?success=declined`);
		} catch (err: any) {
			if (err?.status === 303) throw err;
			console.error('Decline proposal error:', err);
			return fail(500, { error: 'Failed to decline proposal' });
		}
	}
};
