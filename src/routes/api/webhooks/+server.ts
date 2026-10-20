/**
 * Webhooks Management API endpoint
 * CRUD operations for outbound webhooks
 */

import { json, error, type RequestEvent } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth';
import { isValidEmail } from '$lib/server/validation';

const VALID_EVENT_TYPES = [
	'booking.created',
	'booking.rescheduled',
	'booking.canceled',
	'booking.proposal_sent',
	'*'
];

/**
 * Generate a cryptographically secure random secret
 */
function generateWebhookSecret(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const GET = async (event: RequestEvent) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const result = await db
			.prepare(
				`SELECT id, url, events, secret, is_active, created_at
				FROM webhooks
				WHERE user_id = ?
				ORDER BY created_at DESC`
			)
			.bind(userId)
			.all<{
				id: string;
				url: string;
				events: string;
				secret: string;
				is_active: number;
				created_at: string;
			}>();

		const webhooks = (result.results || []).map(wh => {
			let events: string[] = ['*'];
			try {
				events = typeof wh.events === 'string' ? JSON.parse(wh.events) : wh.events;
			} catch {}
			return {
				id: wh.id,
				url: wh.url,
				events,
				secret: wh.secret,
				isActive: Boolean(wh.is_active),
				createdAt: wh.created_at
			};
		});

		return json({ webhooks });
	} catch (err: any) {
		console.error('Failed to list webhooks:', err);
		throw error(500, 'Failed to list webhooks');
	}
};

export const POST = async (event: RequestEvent) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const body = await event.request.json() as {
			url: string;
			events?: string[];
			secret?: string;
		};

		const url = body.url?.trim();
		if (!url) {
			throw error(400, 'Webhook URL is required');
		}

		try {
			const parsed = new URL(url);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				throw new Error('Invalid protocol');
			}
		} catch {
			throw error(400, 'Invalid webhook URL format');
		}

		// Validate events
		let events = body.events && Array.isArray(body.events) && body.events.length > 0 ? body.events : ['*'];
		events = events.filter(e => VALID_EVENT_TYPES.includes(e));
		if (events.length === 0) {
			events = ['*'];
		}

		const secret = (body.secret && body.secret.trim().length >= 8) ? body.secret.trim() : generateWebhookSecret();
		const id = crypto.randomUUID();

		await db
			.prepare(
				`INSERT INTO webhooks (id, user_id, url, events, secret, is_active, created_at)
				VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
			)
			.bind(id, userId, url, JSON.stringify(events), secret)
			.run();

		return json({
			success: true,
			webhook: {
				id,
				url,
				events,
				secret,
				isActive: true
			}
		});
	} catch (err: any) {
		console.error('Failed to create webhook:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to create webhook');
	}
};

export const PATCH = async (event: RequestEvent) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const body = await event.request.json() as {
			id: string;
			url?: string;
			events?: string[];
			secret?: string;
			isActive?: boolean;
		};

		if (!body.id) {
			throw error(400, 'Webhook ID is required');
		}

		// Verify ownership
		const existing = await db
			.prepare('SELECT id FROM webhooks WHERE id = ? AND user_id = ?')
			.bind(body.id, userId)
			.first();

		if (!existing) {
			throw error(404, 'Webhook not found');
		}

		const updates: string[] = [];
		const values: any[] = [];

		if (body.url !== undefined) {
			const trimmedUrl = body.url.trim();
			try {
				const parsed = new URL(trimmedUrl);
				if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
					throw new Error('Invalid protocol');
				}
			} catch {
				throw error(400, 'Invalid webhook URL format');
			}
			updates.push('url = ?');
			values.push(trimmedUrl);
		}

		if (body.events !== undefined && Array.isArray(body.events)) {
			let events = body.events.filter(e => VALID_EVENT_TYPES.includes(e));
			if (events.length === 0) events = ['*'];
			updates.push('events = ?');
			values.push(JSON.stringify(events));
		}

		if (body.secret !== undefined && body.secret.trim().length >= 8) {
			updates.push('secret = ?');
			values.push(body.secret.trim());
		}

		if (body.isActive !== undefined) {
			updates.push('is_active = ?');
			values.push(body.isActive ? 1 : 0);
		}

		if (updates.length > 0) {
			values.push(body.id, userId);
			await db
				.prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
				.bind(...values)
				.run();
		}

		return json({ success: true });
	} catch (err: any) {
		console.error('Failed to update webhook:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to update webhook');
	}
};

export const DELETE = async (event: RequestEvent) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		let id = event.url.searchParams.get('id');
		if (!id) {
			try {
				const body = await event.request.json() as { id?: string };
				id = body.id || null;
			} catch {}
		}

		if (!id) {
			throw error(400, 'Webhook ID is required');
		}

		await db
			.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?')
			.bind(id, userId)
			.run();

		return json({ success: true });
	} catch (err: any) {
		console.error('Failed to delete webhook:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to delete webhook');
	}
};
