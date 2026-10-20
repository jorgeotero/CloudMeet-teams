/**
 * Public portal page for CloudMeet Teams
 */

import type { PageServerLoad } from './$types';
import { getCurrentUser } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	const userId = await getCurrentUser(event);

	return {
		isAuthenticated: !!userId
	};
};
