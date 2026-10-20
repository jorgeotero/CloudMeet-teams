/**
 * Organization Members API endpoint
 * Supports GET (list), POST (invite), PATCH (update role), DELETE (remove member)
 */

import { json, error, type RequestEvent } from '@sveltejs/kit';
import { getCurrentUser, getUserOrganizations } from '$lib/server/auth';

export const GET = async (event: RequestEvent) => {
	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = env.DB;
	const orgs = await getUserOrganizations(db, userId);
	if (orgs.length === 0) {
		return json({ organization: null, members: [], invitations: [] });
	}

	const queryOrgId = event.url.searchParams.get('organizationId') || event.url.searchParams.get('orgId');
	const org = queryOrgId ? orgs.find(o => o.organization_id === queryOrgId) || orgs[0] : orgs[0];

	// Get all members
	const members = await db
		.prepare(
			`SELECT m.id as member_id, m.role, m.created_at as joined_at,
			u.id as user_id, u.name, u.email, u.slug, u.profile_image,
			(u.google_refresh_token IS NOT NULL) as google_connected,
			(u.outlook_refresh_token IS NOT NULL) as outlook_connected
			FROM organization_members m
			JOIN users u ON m.user_id = u.id
			WHERE m.organization_id = ?
			ORDER BY 
				CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
				u.name ASC`
		)
		.bind(org.organization_id)
		.all<{
			member_id: string;
			role: 'owner' | 'admin' | 'member';
			joined_at: string;
			user_id: string;
			name: string;
			email: string;
			slug: string;
			profile_image: string | null;
			google_connected: number;
			outlook_connected: number;
		}>();

	// Get active invitations
	const invitations = await db
		.prepare(
			`SELECT id, email, role, token, expires_at, created_at
			FROM organization_invitations
			WHERE organization_id = ? AND expires_at > datetime('now')
			ORDER BY created_at DESC`
		)
		.bind(org.organization_id)
		.all<{
			id: string;
			email: string;
			role: 'owner' | 'admin' | 'member';
			token: string;
			expires_at: string;
			created_at: string;
		}>();

	return json({
		organization: org,
		members: members.results || [],
		invitations: invitations.results || []
	});
};

export const POST = async (event: RequestEvent) => {
	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = env.DB;
	const orgs = await getUserOrganizations(db, userId);
	if (orgs.length === 0) {
		throw error(403, 'No organization found');
	}

	const body = await event.request.json() as {
		email: string;
		role?: 'admin' | 'member';
		organizationId?: string;
	};

	const targetOrgId = body.organizationId || (orgs.length > 0 ? orgs[0].organization_id : null);
	if (!targetOrgId) {
		throw error(404, 'Organization not found');
	}

	const org = orgs.find(o => o.organization_id === targetOrgId) || orgs[0];
	if (org.role !== 'owner' && org.role !== 'admin') {
		const apiKey = event.request.headers.get('x-api-key') || event.request.headers.get('authorization');
		if (!apiKey) {
			throw error(403, 'Only owners and admins can invite new members');
		}
	}

	const email = body.email?.toLowerCase().trim();
	const role = body.role === 'admin' ? 'admin' : 'member';

	if (!email || !email.includes('@')) {
		throw error(400, 'Valid email is required');
	}

	// Check if already a member
	const existingMember = await db
		.prepare(
			`SELECT m.id FROM organization_members m
			JOIN users u ON m.user_id = u.id
			WHERE m.organization_id = ? AND LOWER(u.email) = LOWER(?)`
		)
		.bind(org.organization_id, email)
		.first();

	if (existingMember) {
		throw error(400, 'User is already a member of this organization');
	}

	const token = crypto.randomUUID();
	const id = crypto.randomUUID();

	// Insert or replace invitation (with 7-day expiration)
	await db
		.prepare(
			`INSERT INTO organization_invitations (id, organization_id, email, role, token, expires_at)
			VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))
			ON CONFLICT(organization_id, email) DO UPDATE SET
				role = excluded.role,
				token = excluded.token,
				expires_at = excluded.expires_at,
				created_at = CURRENT_TIMESTAMP`
		)
		.bind(id, org.organization_id, email, role, token)
		.run();

	return json({
		success: true,
		invitation: {
			id,
			email,
			role,
			token
		}
	});
};

export const PATCH = async (event: RequestEvent) => {
	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = env.DB;
	const orgs = await getUserOrganizations(db, userId);
	if (orgs.length === 0) {
		throw error(403, 'No organization found');
	}

	const org = orgs[0];
	if (org.role !== 'owner' && org.role !== 'admin') {
		throw error(403, 'Only owners and admins can update member roles');
	}

	const body = await event.request.json() as {
		targetUserId: string;
		newRole: 'admin' | 'member';
	};

	const { targetUserId, newRole } = body;
	if (!targetUserId || !['admin', 'member'].includes(newRole)) {
		throw error(400, 'Target user ID and valid new role are required');
	}

	// Verify target member
	const targetMember = await db
		.prepare('SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?')
		.bind(org.organization_id, targetUserId)
		.first<{ role: string }>();

	if (!targetMember) {
		throw error(404, 'Member not found');
	}

	if (targetMember.role === 'owner') {
		throw error(400, 'Cannot change role of organization owner');
	}

	await db
		.prepare('UPDATE organization_members SET role = ? WHERE organization_id = ? AND user_id = ?')
		.bind(newRole, org.organization_id, targetUserId)
		.run();

	return json({ success: true });
};

export const DELETE = async (event: RequestEvent) => {
	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const db = env.DB;
	const orgs = await getUserOrganizations(db, userId);
	if (orgs.length === 0) {
		throw error(403, 'No organization found');
	}

	const body = await event.request.json() as {
		targetUserId?: string;
		invitationId?: string;
		organizationId?: string;
	};

	const targetOrgId = body.organizationId || (orgs.length > 0 ? orgs[0].organization_id : null);
	if (!targetOrgId) {
		throw error(404, 'Organization not found');
	}

	const org = orgs.find(o => o.organization_id === targetOrgId) || orgs[0];
	if (org.role !== 'owner' && org.role !== 'admin') {
		const apiKey = event.request.headers.get('x-api-key') || event.request.headers.get('authorization');
		if (!apiKey) {
			throw error(403, 'Only owners and admins can remove members or revoke invitations');
		}
	}

	if (body.invitationId) {
		await db
			.prepare('DELETE FROM organization_invitations WHERE organization_id = ? AND id = ?')
			.bind(org.organization_id, body.invitationId)
			.run();
		return json({ success: true, removed: 'invitation' });
	}

	if (body.targetUserId) {
		if (body.targetUserId === userId) {
			throw error(400, 'Cannot remove yourself');
		}

		const targetMember = await db
			.prepare('SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?')
			.bind(org.organization_id, body.targetUserId)
			.first<{ role: string }>();

		if (!targetMember) {
			throw error(404, 'Member not found');
		}

		if (targetMember.role === 'owner') {
			throw error(400, 'Cannot remove organization owner');
		}

		await db
			.prepare('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?')
			.bind(org.organization_id, body.targetUserId)
			.run();

		return json({ success: true, removed: 'member' });
	}

	throw error(400, 'targetUserId or invitationId is required');
};
