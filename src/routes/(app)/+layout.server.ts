import { db } from '$lib/server/db';
import { listFamiliesOfUser } from '$lib/server/families';
import { requireUser } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user } = requireUser(locals);
	return {
		user,
		family: locals.family,
		families: await listFamiliesOfUser(db, user.id)
	};
};
