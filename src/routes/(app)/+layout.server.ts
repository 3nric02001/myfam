import { db } from '$lib/server/db';
import { listFamiliesOfUser, listMemberColors } from '$lib/server/families';
import { requireUser } from '$lib/server/guards';
import { vapidKeys } from '$lib/server/push';
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user } = requireUser(locals);
	return {
		user,
		family: locals.family,
		families: await listFamiliesOfUser(db, user.id),
		/** Everyone in the current family with their colour, for the coloured dots. */
		memberColors: locals.family ? await listMemberColors(db, locals.family.id) : [],
		pushKey: vapidKeys(db, env).publicKey
	};
};
