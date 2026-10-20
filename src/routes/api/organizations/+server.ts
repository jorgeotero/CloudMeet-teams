/**
 * Organizations Management API endpoint
 * Supports GET (list), POST (create company/tenant), PATCH (update company/workspace)
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

	return json({
		organizations: orgs
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
	const body = await event.request.json() as {
		name?: string;
		slug?: string;
		logoUrl?: string;
	};

	const name = body.name?.trim();
	if (!name) {
		throw error(400, 'Organization name is required');
	}

	const baseSlug = (body.slug || name)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'org';

	// Ensure unique slug
	let slug = baseSlug;
	let counter = 1;
	while (true) {
		const existing = await db.prepare('SELECT id FROM organizations WHERE slug = ?').bind(slug).first();
		if (!existing) break;
		slug = `${baseSlug}-${counter++}`;
	}

	const orgId = crypto.randomUUID();
	const memberId = crypto.randomUUID();

	await db
		.prepare('INSERT INTO organizations (id, name, slug, logo_url) VALUES (?, ?, ?, ?)')
		.bind(orgId, name, slug, body.logoUrl || null)
		.run();

	await db
		.prepare('INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)')
		.bind(memberId, orgId, userId, 'owner')
		.run();

	return json({
		success: true,
		organization: {
			id: orgId,
			name,
			slug,
			logo_url: body.logoUrl || null,
			role: 'owner'
		}
	}, { status: 201 });
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
	const body = await event.request.json() as {
		organizationId?: string;
		name?: string;
		slug?: string;
		logoUrl?: string;
	};

	const orgs = await getUserOrganizations(db, userId);
	const targetOrgId = body.organizationId || (orgs.length > 0 ? orgs[0].organization_id : null);

	if (!targetOrgId) {
		throw error(404, 'Organization not found');
	}

	// Verify permissions (owner or admin)
	const userOrg = orgs.find(o => o.organization_id === targetOrgId);
	if (!userOrg || (userOrg.role !== 'owner' && userOrg.role !== 'admin')) {
		// Check if M2M API key was used
		const apiKey = event.request.headers.get('x-api-key') || event.request.headers.get('authorization');
		if (!apiKey) {
			throw error(403, 'Only owners and admins can update organization settings');
		}
	}

	const updates: string[] = [];
	const bindings: any[] = [];

	if (body.name !== undefined) {
		updates.push('name = ?');
		bindings.push(body.name.trim());
	}

	if (body.slug !== undefined) {
		const newSlug = body.slug.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
		// Verify slug uniqueness
		const existing = await db
			.prepare('SELECT id FROM organizations WHERE slug = ? AND id != ?')
			.bind(newSlug, targetOrgId)
			.first();
		if (existing) {
			throw error(400, 'Slug is already in use by another organization');
		}
		updates.push('slug = ?');
		bindings.push(newSlug);
	}

	if (body.logoUrl !== undefined) {
		updates.push('logo_url = ?');
		bindings.push(body.logoUrl || null);
	}

	if (updates.length > 0) {
		bindings.push(targetOrgId);
		await db
			.prepare(`UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`)
			.bind(...bindings)
			.run();
	}

	const updated = await db
		.prepare('SELECT id, name, slug, logo_url FROM organizations WHERE id = ?')
		.bind(targetOrgId)
		.first<{ id: string; name: string; slug: string; logo_url: string | null }>();

	return json({
		success: true,
		organization: updated
	});
};
