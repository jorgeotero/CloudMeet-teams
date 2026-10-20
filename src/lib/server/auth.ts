/**
 * Server-side authentication utilities for Google OAuth
 * Single-user system - only the owner can log in
 */

import type { RequestEvent } from '@sveltejs/kit';

export interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
	scope: string;
}

export interface GoogleUserInfo {
	id: string;
	email: string;
	name: string;
	picture: string;
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthUrl(clientId: string, redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events',
			'https://www.googleapis.com/auth/userinfo.email',
			'https://www.googleapis.com/auth/userinfo.profile'
		].join(' '),
		access_type: 'offline',
		prompt: 'consent',
		state
	});

	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<GoogleTokenResponse> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to exchange code for tokens: ${error}`);
	}

	return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string
): Promise<GoogleTokenResponse> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to refresh access token: ${error}`);
	}

	return response.json();
}

/**
 * Get user info from Google
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
	const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		throw new Error('Failed to get user info');
	}

	return response.json();
}

/**
 * Create session token (simple JWT-like token)
 */
export async function createSessionToken(
	userId: string,
	secret: string
): Promise<string> {
	const payload = {
		userId,
		iat: Date.now()
	};

	// Simple base64 encoding with signature
	const data = btoa(JSON.stringify(payload));
	const signature = await hashString(`${data}.${secret}`);

	return `${data}.${signature}`;
}

/**
 * Verify session token
 */
export async function verifySessionToken(
	token: string,
	secret: string
): Promise<{ userId: string } | null> {
	try {
		const [data, signature] = token.split('.');
		const expectedSignature = await hashString(`${data}.${secret}`);

		if (signature !== expectedSignature) {
			return null;
		}

		const payload = JSON.parse(atob(data));

		// Check if token is expired (7 days - matches cookie maxAge)
		const age = Date.now() - payload.iat;
		if (age > 7 * 24 * 60 * 60 * 1000) {
			return null;
		}

		return { userId: payload.userId };
	} catch {
		return null;
	}
}

/**
 * Hash string using Web Crypto API
 */
async function hashString(str: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface OrganizationMembership {
	id: string;
	organization_id: string;
	organization_name: string;
	organization_slug: string;
	logo_url: string | null;
	role: 'owner' | 'admin' | 'member';
}

export interface CurrentUserSession {
	id: string;
	userId: string;
	organizations: OrganizationMembership[];
}

/**
 * Get all organizations a user belongs to with their role
 */
export async function getUserOrganizations(
	db: D1Database,
	userId: string
): Promise<OrganizationMembership[]> {
	try {
		const result = await db
			.prepare(
				`SELECT m.id, m.organization_id, o.name as organization_name, o.slug as organization_slug, o.logo_url, m.role
				FROM organization_members m
				JOIN organizations o ON m.organization_id = o.id
				WHERE m.user_id = ?`
			)
			.bind(userId)
			.all<OrganizationMembership>();
		return result.results || [];
	} catch (err) {
		console.error('Failed to get user organizations:', err);
		return [];
	}
}

/**
 * Get current user from session cookie
 */
export async function getCurrentUser(event: RequestEvent): Promise<string | null>;
export async function getCurrentUser(event: RequestEvent, withOrgs: true): Promise<CurrentUserSession | null>;
export async function getCurrentUser(
	event: RequestEvent,
	withOrgs?: boolean
): Promise<string | CurrentUserSession | null> {
	const env = event.platform?.env;
	const jwtSecret = env?.JWT_SECRET;
	const cronSecret = env?.CRON_SECRET;

	// 1. Check for Machine-to-Machine API Key (for CRM integration)
	const apiKeyHeader = event.request.headers.get('x-api-key');
	const authHeader = event.request.headers.get('authorization');
	const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
	const providedKey = apiKeyHeader || bearerToken;

	if (providedKey && jwtSecret && (providedKey === jwtSecret || (cronSecret && providedKey === cronSecret))) {
		const db = env?.DB;
		const requestedUserId = event.request.headers.get('x-user-id');
		let effectiveUserId = requestedUserId;

		if (!effectiveUserId && db) {
			const adminUser = await db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').first<{ id: string }>();
			effectiveUserId = adminUser?.id || 'system-admin';
		}

		if (!withOrgs) {
			return effectiveUserId || 'system-admin';
		}

		const organizations = db && effectiveUserId ? await getUserOrganizations(db, effectiveUserId) : [];
		return {
			id: effectiveUserId || 'system-admin',
			userId: effectiveUserId || 'system-admin',
			organizations
		};
	}

	// 2. Check for browser user session cookie
	const sessionToken = event.cookies.get('session');
	if (!sessionToken) {
		return null;
	}

	if (!jwtSecret) {
		return null;
	}

	const session = await verifySessionToken(sessionToken, jwtSecret);
	if (!session?.userId) {
		return null;
	}

	if (!withOrgs) {
		return session.userId;
	}

	const db = env?.DB;
	const organizations = db ? await getUserOrganizations(db, session.userId) : [];

	return {
		id: session.userId,
		userId: session.userId,
		organizations
	};
}

/**
 * Convenience helper to get current user with organizations
 */
export async function getCurrentUserWithOrgs(event: RequestEvent): Promise<CurrentUserSession | null> {
	return getCurrentUser(event, true);
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(event: RequestEvent): Promise<string> {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw new Error('Not authenticated');
	}
	return userId;
}
