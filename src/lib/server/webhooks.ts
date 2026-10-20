/**
 * Outbound Webhooks Engine
 * Signs payloads using Web Crypto API HMAC-SHA256 and dispatches to registered endpoints.
 */

export type WebhookEventType =
	| 'booking.created'
	| 'booking.rescheduled'
	| 'booking.canceled'
	| 'booking.proposal_sent';

export interface WebhookBookingDetails {
	id: string;
	event_type_id: string;
	event_slug: string;
	user_id: string;
	host_email: string;
	start_time: string;
	end_time: string;
	attendee_name: string;
	attendee_email: string;
	attendee_phone?: string | null;
	attendee_notes?: string | null;
	external_ref?: string | null;
	metadata?: Record<string, any> | string | null;
	meeting_url?: string | null;
	status: string;
	[key: string]: any;
}

/**
 * Sign payload string with HMAC-SHA256 using the Web Crypto API
 */
export async function signWebhookPayload(secret: string, body: string): Promise<string> {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(secret);
	const messageData = encoder.encode(body);

	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
	const signatureArray = Array.from(new Uint8Array(signatureBuffer));
	return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize booking payload to ensure all standard fields are present
 */
export function formatBookingWebhookPayload(booking: Record<string, any>): Record<string, any> {
	let metadata = booking.metadata;
	if (typeof metadata === 'string') {
		try {
			metadata = JSON.parse(metadata);
		} catch {
			// keep string or null
		}
	}

	return {
		id: booking.id,
		event_type_id: booking.event_type_id,
		event_slug: booking.event_slug,
		user_id: booking.user_id,
		host_email: booking.host_email,
		start_time: booking.start_time,
		end_time: booking.end_time,
		attendee_name: booking.attendee_name,
		attendee_email: booking.attendee_email,
		attendee_phone: booking.attendee_phone || null,
		attendee_notes: booking.attendee_notes || null,
		external_ref: booking.external_ref || null,
		metadata: metadata || null,
		meeting_url: booking.meeting_url || null,
		status: booking.status,
		...(booking.old_start_time ? { old_start_time: booking.old_start_time } : {}),
		...(booking.old_end_time ? { old_end_time: booking.old_end_time } : {}),
		...(booking.proposed_start_time ? { proposed_start_time: booking.proposed_start_time } : {}),
		...(booking.proposed_end_time ? { proposed_end_time: booking.proposed_end_time } : {}),
		...(booking.message ? { message: booking.message } : {}),
		...(booking.response_token ? { response_token: booking.response_token } : {}),
		...(booking.cancellation_reason ? { cancellation_reason: booking.cancellation_reason } : {}),
		...(booking.canceled_by ? { canceled_by: booking.canceled_by } : {})
	};
}

/**
 * Dispatch an outbound webhook event to all subscribed endpoints for a user
 */
export async function dispatchWebhookEvent(
	db: D1Database,
	userId: string,
	eventType: WebhookEventType,
	payload: Record<string, any>
): Promise<void> {
	try {
		// Query active webhooks for this user
		const result = await db
			.prepare(
				`SELECT id, url, events, secret
				FROM webhooks
				WHERE user_id = ? AND is_active = 1`
			)
			.bind(userId)
			.all<{ id: string; url: string; events: string; secret: string }>();

		const webhooks = result.results || [];
		if (webhooks.length === 0) return;

		// Filter webhooks whose events JSON array contains this eventType or '*'
		const matchingWebhooks = webhooks.filter((wh) => {
			try {
				const eventsList: string[] = typeof wh.events === 'string' ? JSON.parse(wh.events) : wh.events;
				return Array.isArray(eventsList) && (eventsList.includes(eventType) || eventsList.includes('*'));
			} catch {
				return false;
			}
		});

		if (matchingWebhooks.length === 0) return;

		const timestamp = new Date().toISOString();
		const bodyObject = {
			event: eventType,
			created_at: timestamp,
			data: formatBookingWebhookPayload(payload)
		};
		const jsonBody = JSON.stringify(bodyObject);

		await Promise.allSettled(
			matchingWebhooks.map(async (wh) => {
				try {
					const hexDigest = await signWebhookPayload(wh.secret, jsonBody);
					const response = await fetch(wh.url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-CloudMeet-Event': eventType,
							'X-CloudMeet-Signature': `sha256=${hexDigest}`,
							'X-CloudMeet-Timestamp': timestamp
						},
						body: jsonBody
					});

					if (!response.ok) {
						console.error(`Webhook delivery to ${wh.url} returned status ${response.status}`);
					}
				} catch (deliveryError) {
					console.error(`Webhook delivery to ${wh.url} failed:`, deliveryError);
				}
			})
		);
	} catch (err) {
		console.error('Error dispatching webhook event:', err);
	}
}

/**
 * Convenience helper to trigger dispatchWebhookEvent via platform.context.waitUntil
 */
export function queueWebhookEvent(
	platform: App.Platform | undefined,
	db: D1Database,
	userId: string,
	eventType: WebhookEventType,
	payload: Record<string, any>
): void {
	const promise = dispatchWebhookEvent(db, userId, eventType, payload);
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(promise);
	} else {
		promise.catch(err => console.error('Background webhook dispatch error:', err));
	}
}
