import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guards';
import { secretKey } from '$lib/server/calendar-sync';
import {
	checkSubscription,
	deleteSubscription,
	getSubscription,
	subscriptionFromForm,
	syncSubscription,
	updateSubscription
} from '$lib/server/subscriptions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { family } = requireAdmin(locals);
	const row = await getSubscription(db, family.id, params.id);
	if (!row) error(404, 'Abo nicht gefunden');
	const { password, ...subscription } = row;
	return { subscription: { ...subscription, hasPassword: !!password } };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const { family } = requireAdmin(locals);
		const result = checkSubscription(subscriptionFromForm(await request.formData()));
		if ('error' in result) return fail(400, { message: result.error });
		const updated = await updateSubscription(
			db,
			secretKey(),
			family.id,
			params.id,
			result.subscription
		);
		if (!updated) error(404, 'Abo nicht gefunden');
		if ('error' in updated) return fail(400, { message: updated.error });
		const syncError = await syncSubscription(db, secretKey(), updated.subscription);
		if (syncError)
			return fail(400, { message: `Gespeichert, aber der Abruf klappte nicht: ${syncError}` });
		redirect(303, '/kalender/abos');
	},

	delete: async ({ locals, params }) => {
		const { family } = requireAdmin(locals);
		await deleteSubscription(db, family.id, params.id);
		redirect(303, '/kalender/abos');
	}
};
