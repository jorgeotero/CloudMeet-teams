/**
 * Cancel booking page
 */

import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { cancelCalendarEvent, getValidAccessToken } from '$lib/server/google-calendar';
import { cancelOutlookCalendarEvent, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';
import { sendCancellationEmail, sendAdminCancellationNotification, getEmailTemplates, isEmailEnabled } from '$lib/server/email';
import { invalidateAvailabilityCache } from '$lib/cache/kv-cache';
import { queueWebhookEvent } from '$lib/server/webhooks';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const bookingId = params.id;

	// Get booking details
	const booking = await db
		.prepare(
			`SELECT b.id, b.start_time, b.end_time, b.attendee_name, b.attendee_email,
			b.status, b.google_event_id, e.name as event_name, e.slug as event_slug, u.name as host_name
			FROM bookings b
			JOIN event_types e ON b.event_type_id = e.id
			JOIN users u ON b.user_id = u.id
			WHERE b.id = ?`
		)
		.bind(bookingId)
		.first<{
			id: string;
			start_time: string;
			end_time: string;
			attendee_name: string;
			attendee_email: string;
			status: string;
			google_event_id: string | null;
			event_name: string;
			event_slug: string;
			host_name: string;
		}>();

	if (!booking) {
		throw error(404, 'Booking not found');
	}

	if (booking.status === 'canceled') {
		return {
			booking,
			alreadyCanceled: true
		};
	}

	return {
		booking,
		alreadyCanceled: false
	};
};

export const actions: Actions = {
	default: async ({ params, platform, request }) => {
		const db = platform?.env?.DB;
		const env = platform?.env;
		if (!db || !env) {
			return fail(500, { error: 'Database not available' });
		}

		const bookingId = params.id;

		// Get cancellation reason from form
		const formData = await request.formData();
		const reason = formData.get('reason')?.toString().trim() || null;

		try {
			// Get booking and user details
			const booking = await db
				.prepare(
					`SELECT b.id, b.user_id, b.google_event_id, b.outlook_event_id, b.status, b.start_time,
					e.slug as event_slug, u.outlook_refresh_token
					FROM bookings b
					JOIN event_types e ON b.event_type_id = e.id
					JOIN users u ON b.user_id = u.id
					WHERE b.id = ?`
				)
				.bind(bookingId)
				.first<{
					id: string;
					user_id: string;
					google_event_id: string | null;
					outlook_event_id: string | null;
					status: string;
					start_time: string;
					event_slug: string;
					outlook_refresh_token: string | null;
				}>();

			if (!booking) {
				return fail(404, { error: 'Booking not found' });
			}

			if (booking.status === 'canceled') {
				return fail(400, { error: 'Booking already canceled' });
			}

			// Cancel in Google Calendar if event exists
			if (booking.google_event_id) {
				try {
					const accessToken = await getValidAccessToken(
						db,
						booking.user_id,
						env.GOOGLE_CLIENT_ID,
						env.GOOGLE_CLIENT_SECRET
					);
					await cancelCalendarEvent(accessToken, booking.google_event_id);
				} catch (err) {
					console.error('Failed to cancel Google Calendar event:', err);
					// Continue with database cancellation even if Google Calendar fails
				}
			}

			// Cancel in Outlook Calendar if event exists and host has refresh token
			if (booking.outlook_event_id && booking.outlook_refresh_token && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
				try {
					const outlookToken = await getValidOutlookAccessToken(
						db,
						booking.user_id,
						env.MICROSOFT_CLIENT_ID,
						env.MICROSOFT_CLIENT_SECRET
					);
					await cancelOutlookCalendarEvent(outlookToken, booking.outlook_event_id);
				} catch (err) {
					console.error('Failed to cancel Outlook Calendar event:', err);
					// Continue with database cancellation even if Outlook Calendar fails
				}
			}

			// Update booking status and cancel scheduled reminders
			await db
				.prepare('UPDATE bookings SET status = ?, canceled_at = CURRENT_TIMESTAMP, canceled_by = ?, cancellation_reason = ? WHERE id = ?')
				.bind('canceled', 'attendee', reason, bookingId)
				.run();

			// Cancel any scheduled reminder emails
			await db
				.prepare(`UPDATE scheduled_emails SET status = 'cancelled' WHERE booking_id = ? AND status = 'pending'`)
				.bind(bookingId)
				.run();

			// Invalidate availability cache (daily and monthly)
			await invalidateAvailabilityCache(env.KV, booking.user_id, booking.event_slug, booking.start_time);

			// Get full booking details for webhook and email
			const fullBooking = await db
				.prepare(
					`SELECT b.id, b.user_id, b.event_type_id, b.start_time, b.end_time,
					b.attendee_name, b.attendee_email, b.attendee_phone, b.attendee_notes,
					b.external_ref, b.metadata, b.meeting_url,
					e.name as event_name, e.slug as event_slug, e.description as event_description,
					u.name as host_name, u.email as host_email, u.contact_email, u.settings, u.brand_color
					FROM bookings b
					JOIN event_types e ON b.event_type_id = e.id
					JOIN users u ON b.user_id = u.id
					WHERE b.id = ?`
				)
				.bind(bookingId)
				.first<{
					id: string;
					user_id: string;
					event_type_id: string;
					start_time: string;
					end_time: string;
					attendee_name: string;
					attendee_email: string;
					attendee_phone: string | null;
					attendee_notes: string | null;
					external_ref: string | null;
					metadata: string | null;
					meeting_url: string | null;
					event_name: string;
					event_slug: string;
					event_description: string | null;
					host_name: string;
					host_email: string;
					contact_email: string | null;
					settings: string | null;
					brand_color: string | null;
				}>();

			if (fullBooking) {
				// Dispatch booking.canceled webhook event
				queueWebhookEvent(platform, db, fullBooking.user_id, 'booking.canceled', {
					id: fullBooking.id,
					event_type_id: fullBooking.event_type_id,
					event_slug: fullBooking.event_slug,
					user_id: fullBooking.user_id,
					host_email: fullBooking.host_email,
					start_time: fullBooking.start_time,
					end_time: fullBooking.end_time,
					attendee_name: fullBooking.attendee_name,
					attendee_email: fullBooking.attendee_email,
					attendee_phone: fullBooking.attendee_phone,
					attendee_notes: fullBooking.attendee_notes,
					external_ref: fullBooking.external_ref,
					metadata: fullBooking.metadata,
					meeting_url: fullBooking.meeting_url,
					status: 'canceled',
					canceled_by: 'attendee',
					cancellation_reason: reason
				});
			}

			// Send cancellation email if enabled
			if (env.EMAILIT_API_KEY && fullBooking) {
				try {
						// Parse user settings for time format
						let timeFormat: '12h' | '24h' = '12h';
						try {
							const settings = fullBooking.settings ? JSON.parse(fullBooking.settings) : {};
							timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
						} catch {
							// Keep default
						}

						const replyToEmail = fullBooking.contact_email || fullBooking.host_email;
						const templates = await getEmailTemplates(db, fullBooking.user_id);
						if (isEmailEnabled(templates, 'cancellation')) {
							const template = templates.get('cancellation');
							await sendCancellationEmail(
								{
									attendeeName: fullBooking.attendee_name,
									attendeeEmail: fullBooking.attendee_email,
									eventName: fullBooking.event_name,
									eventSlug: fullBooking.event_slug,
									eventDescription: fullBooking.event_description || '',
									startTime: new Date(fullBooking.start_time),
									endTime: new Date(fullBooking.end_time),
									meetingUrl: null,
									bookingId: fullBooking.id,
									hostName: fullBooking.host_name,
									hostEmail: fullBooking.host_email,
									hostContactEmail: fullBooking.contact_email || undefined,
									appUrl: env.APP_URL || '',
									customMessage: reason || template?.custom_message,
									timeFormat,
									brandColor: fullBooking.brand_color || undefined
								},
								{
									apiKey: env.EMAILIT_API_KEY,
									from: env.EMAIL_FROM || fullBooking.host_email,
									replyTo: replyToEmail
								},
								template?.subject || undefined
							);
						}

						// Send admin notification when attendee cancels
						try {
							await sendAdminCancellationNotification(
								{
									attendeeName: fullBooking.attendee_name,
									attendeeEmail: fullBooking.attendee_email,
									eventName: fullBooking.event_name,
									eventSlug: fullBooking.event_slug,
									eventDescription: fullBooking.event_description || '',
									startTime: new Date(fullBooking.start_time),
									endTime: new Date(fullBooking.end_time),
									meetingUrl: null,
									bookingId: fullBooking.id,
									hostName: fullBooking.host_name,
									hostEmail: fullBooking.host_email,
									appUrl: env.APP_URL || '',
									customMessage: reason,
									timeFormat,
									brandColor: fullBooking.brand_color || undefined
								},
								fullBooking.host_email,
								{
									apiKey: env.EMAILIT_API_KEY,
									from: env.EMAIL_FROM || fullBooking.host_email
								}
							);
						} catch (adminErr) {
							console.error('Failed to send admin cancellation notification:', adminErr);
						}
				} catch (emailErr) {
					console.error('Failed to send cancellation email:', emailErr);
				}
			}

			throw redirect(303, `/cancel/${bookingId}?success=true`);
		} catch (err: any) {
			if (err?.status === 303) throw err; // Re-throw redirects
			console.error('Cancellation error:', err);
			return fail(500, { error: err?.message || 'Failed to cancel booking' });
		}
	}
};
