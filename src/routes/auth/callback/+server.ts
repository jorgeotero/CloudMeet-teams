/**
 * Google OAuth callback handler
 */

import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCodeForTokens, getGoogleUserInfo, createSessionToken } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	// Handle OAuth errors
	if (errorParam) {
		throw error(400, `OAuth error: ${errorParam}`);
	}

	if (!code || !state) {
		throw error(400, 'Missing code or state parameter');
	}

	// Verify state to prevent CSRF
	const storedState = await env.KV.get(`oauth_state:${state}`);
	if (!storedState) {
		throw error(400, 'Invalid state parameter');
	}

	// Delete used state
	await env.KV.delete(`oauth_state:${state}`);

	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	const appUrl = env.APP_URL;
	const adminEmail = env.ADMIN_EMAIL;

	if (!clientId || !clientSecret || !appUrl) {
		throw error(500, 'Missing OAuth configuration');
	}

	try {
		// Exchange code for tokens
		const redirectUri = `${appUrl}/auth/callback`;
		const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);

		// Get user info
		const userInfo = await getGoogleUserInfo(tokens.access_token);
		const userEmail = userInfo.email.toLowerCase().trim();
		const db = env.DB;

		const isAdmin = adminEmail ? userEmail === adminEmail.toLowerCase().trim() : true;

		// If not admin, check if user is invited or already an active member of an organization
		let pendingInvitations: Array<{ id: string; organization_id: string; role: 'owner' | 'admin' | 'member' }> = [];
		if (!isAdmin) {
			// Check for pending active invitations
			const invQuery = await db
				.prepare(
					`SELECT id, organization_id, role
					FROM organization_invitations
					WHERE LOWER(email) = LOWER(?) AND expires_at > datetime('now')`
				)
				.bind(userEmail)
				.all<{ id: string; organization_id: string; role: 'owner' | 'admin' | 'member' }>();

			pendingInvitations = invQuery.results || [];

			// Check for existing active membership
			const existingMember = await db
				.prepare(
					`SELECT m.id, m.organization_id, m.role
					FROM organization_members m
					JOIN users u ON m.user_id = u.id
					WHERE LOWER(u.email) = LOWER(?)`
				)
				.bind(userEmail)
				.first<{ id: string; organization_id: string; role: string }>();

			if (pendingInvitations.length === 0 && !existingMember) {
				throw error(403, 'Access denied. You must be invited by an organization administrator.');
			}
		}

		// Check if user exists by email
		let user = await db
			.prepare('SELECT id, slug FROM users WHERE LOWER(email) = LOWER(?)')
			.bind(userEmail)
			.first<{ id: string; slug: string }>();

		let userId: string;
		if (!user) {
			userId = crypto.randomUUID();
			const baseSlug = userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
			
			// Ensure unique user slug
			let slug = baseSlug;
			let counter = 1;
			while (true) {
				const existing = await db.prepare('SELECT id FROM users WHERE slug = ?').bind(slug).first();
				if (!existing) break;
				slug = `${baseSlug}-${counter++}`;
			}

			await db
				.prepare(
					`INSERT INTO users (id, email, name, slug, google_refresh_token, profile_image, created_at)
					VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
				)
				.bind(
					userId,
					userEmail,
					userInfo.name,
					slug,
					tokens.refresh_token || null,
					userInfo.picture || null
				)
				.run();

			user = { id: userId, slug };
		} else {
			userId = user.id;
			// Update existing user's tokens & profile
			await db
				.prepare(
					`UPDATE users
					SET google_refresh_token = COALESCE(?, google_refresh_token),
						email = ?,
						name = ?,
						profile_image = COALESCE(?, profile_image)
					WHERE id = ?`
				)
				.bind(
					tokens.refresh_token || null,
					userEmail,
					userInfo.name,
					userInfo.picture || null,
					userId
				)
				.run();
		}

		// Ensure Organization setup:
		if (isAdmin) {
			// Ensure a default organization exists for this super-owner
			const existingOwnerOrg = await db
				.prepare(
					`SELECT o.id, o.slug
					FROM organizations o
					JOIN organization_members m ON o.id = m.organization_id
					WHERE m.user_id = ? AND m.role = 'owner'`
				)
				.bind(userId)
				.first<{ id: string; slug: string }>();

			if (!existingOwnerOrg) {
				const orgId = crypto.randomUUID();
				const orgName = `${userInfo.name}'s Workspace`;
				let orgSlug = user.slug || 'workspace';
				let counter = 1;
				while (true) {
					const existing = await db.prepare('SELECT id FROM organizations WHERE slug = ?').bind(orgSlug).first();
					if (!existing) break;
					orgSlug = `${user.slug}-org-${counter++}`;
				}

				await db
					.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)')
					.bind(orgId, orgName, orgSlug)
					.run();

				await db
					.prepare('INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)')
					.bind(crypto.randomUUID(), orgId, userId, 'owner')
					.run();

				// Associate existing unassociated event_types and bookings
				await db
					.prepare('UPDATE event_types SET organization_id = ? WHERE user_id = ? AND organization_id IS NULL')
					.bind(orgId, userId)
					.run();

				await db
					.prepare('UPDATE bookings SET organization_id = ? WHERE user_id = ? AND organization_id IS NULL')
					.bind(orgId, userId)
					.run();
			}
		}

		// Process any pending invitations for this user
		if (pendingInvitations.length > 0) {
			for (const invitation of pendingInvitations) {
				// Upsert membership
				await db
					.prepare(
						`INSERT INTO organization_members (id, organization_id, user_id, role)
						VALUES (?, ?, ?, ?)
						ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role`
					)
					.bind(crypto.randomUUID(), invitation.organization_id, userId, invitation.role)
					.run();

				// Delete accepted invitation
				await db
					.prepare('DELETE FROM organization_invitations WHERE id = ?')
					.bind(invitation.id)
					.run();
			}
		}

		// Ensure Multi-Tenant Organization Slug & Default 'Reunión Virtual' Event Type
		const memberOrgs = await db
			.prepare(
				`SELECT o.id, o.slug
				FROM organizations o
				JOIN organization_members m ON o.id = m.organization_id
				WHERE m.user_id = ?
				ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1`
			)
			.bind(userId)
			.first<{ id: string; slug: string }>();

		if (memberOrgs) {
			const orgSlug = memberOrgs.slug;
			const cleanNameSlug = (userInfo.name || userEmail.split('@')[0])
				.toLowerCase()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/[^a-z0-9]/g, '');
			const targetSlug = `${orgSlug}-${cleanNameSlug}`;

			// Update slug to include organization if not already scoped
			if (!user.slug.startsWith(`${orgSlug}-`)) {
				await db
					.prepare('UPDATE users SET slug = ? WHERE id = ?')
					.bind(targetSlug, userId)
					.run();
				user.slug = targetSlug;
			}

			// Ensure default 30-min 'Reunión Virtual' event type exists for this organization & user
			const existingEventType = await db
				.prepare('SELECT id FROM event_types WHERE user_id = ? AND slug = ?')
				.bind(userId, 'reunion-virtual')
				.first<{ id: string }>();

			if (!existingEventType) {
				const eventTypeId = crypto.randomUUID();
				await db
					.prepare(
						`INSERT INTO event_types (
							id, user_id, organization_id, name, slug, duration_minutes,
							description, location_type, is_active
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.bind(
						eventTypeId,
						userId,
						memberOrgs.id,
						'Reunión Virtual',
						'reunion-virtual',
						30,
						'Reunión comercial virtual para presentación de cotización y dudas.',
						'google_meet',
						1
					)
					.run();

				// Ensure weekly recurring availability (Monday to Friday, 09:00 - 18:00)
				for (let day = 1; day <= 5; day++) {
					await db
						.prepare(
							`INSERT INTO availability_rules (id, user_id, event_type_id, day_of_week, start_time, end_time, is_active)
							VALUES (?, ?, ?, ?, ?, ?, ?)`
						)
						.bind(crypto.randomUUID(), userId, eventTypeId, day, '09:00', '18:00', 1)
						.run();
				}
			}
		}

		// Create session token (note: user.id is now a string UUID)
		const sessionToken = await createSessionToken(user.id, env.JWT_SECRET);

		// Set session cookie
		cookies.set('session', sessionToken, {
			path: '/',
			httpOnly: true,
			secure: appUrl.startsWith('https'),
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7 // 7 days
		});

		// Redirect to dashboard
		throw redirect(302, '/dashboard');
	} catch (err: any) {
		// Re-throw redirects
		if (err?.status && err?.location) {
			throw err;
		}
		console.error('OAuth callback error:', err);
		throw error(500, `Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
};
