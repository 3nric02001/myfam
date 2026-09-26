import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin, requireFamily } from '$lib/server/guards';
import { field } from '$lib/server/validation';
import { secretKey } from '$lib/server/calendar-sync';
import {
	checkSubscription,
	createSubscription,
	deleteSubscription,
	getSubscription,
	listSubscriptions,
	subscriptionFromForm,
	syncSubscription
} from '$lib/server/subscriptions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	const subscriptions = await listSubscriptions(db, family.id);
	return {
		isAdmin: family.role === 'admin',
		// Members only see names and status; the addresses may contain private tokens.
		subscriptions: subscriptions.map((s) => ({
			id: s.id,
			name: s.name,
			color: s.color,
			syncedAt: s.syncedAt,
			error: s.error,
			url: family.role === 'admin' ? s.url : null
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { user, family } = requireAdmin(locals);
		const form = await request.formData();
		const result = checkSubscription(subscriptionFromForm(form));
		const values = {
			name: field(form, 'name'),
			url: field(form, 'url'),
			username: field(form, 'username'),
			color: field(form, 'color')
		};
		if ('error' in result) return fail(400, { message: result.error, values });
		const row = await createSubscription(db, secretKey(), family.id, user.id, result.subscription);
		// Only keep subscriptions that work, so a typo doesn't leave a broken entry behind.
		const syncError = await syncSubscription(db, secretKey(), row);
		if (syncError) {
			await deleteSubscription(db, family.id, row.id);
			return fail(400, { message: syncError, values });
		}
		return { created: row.name };
	},

	sync: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const row = await getSubscription(db, family.id, field(await request.formData(), 'id'));
		if (!row) return fail(404);
		// Repeated taps should not hammer the calendar server.
		if (row.syncedAt && Date.now() - row.syncedAt.getTime() < 20_000) return;
		await syncSubscription(db, secretKey(), row);
	}
};
