import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { getSubscriptionEvent } from '$lib/server/subscriptions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { family } = requireFamily(locals);
	const event = await getSubscriptionEvent(db, family.id, params.id);
	if (!event) error(404, 'Termin nicht gefunden');
	return { event };
};
