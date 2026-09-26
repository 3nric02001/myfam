import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { deletePurchase, getPurchase } from '$lib/server/purchases';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { family } = requireFamily(locals);
	const purchase = await getPurchase(db, family.id, params.id);
	if (!purchase) error(404, 'Diesen Einkauf gibt es nicht (mehr).');
	return { purchase };
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		const { family } = requireFamily(locals);
		await deletePurchase(db, family.id, params.id);
		redirect(303, '/einkauf/verlauf');
	}
};
