import { fail } from '@sveltejs/kit';
import { today } from '$lib/dates';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { addItem, clearDone, deleteItem, listItems, setDone } from '$lib/server/shopping';
import { marktguruEnabled } from '$lib/server/marktguru';
import { offersForList, purgeOffers } from '$lib/server/offers';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	const items = await listItems(db, family.id);
	const day = today();
	const open = items.filter((i) => !i.done).map(({ id, name }) => ({ id, name }));
	// Streamed, so the list shows at once even when fetching offers takes a moment.
	const offers = purgeOffers(db, day).then(() =>
		offersForList(db, family.id, open, day, { auto: marktguruEnabled() })
	);
	return { items, offers };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const name = field(form, 'name');
		const quantity = field(form, 'quantity');
		if (!name) return fail(400, { message: 'Was soll eingekauft werden?' });
		if (name.length > 100 || quantity.length > 30) {
			return fail(400, { message: 'Der Eintrag ist zu lang.' });
		}
		await addItem(db, family.id, user.id, { name, quantity });
	},

	toggle: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		await setDone(db, family.id, field(form, 'id'), field(form, 'done') === 'true');
	},

	delete: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		await deleteItem(db, family.id, field(form, 'id'));
	},

	clearDone: async ({ locals }) => {
		const { family } = requireFamily(locals);
		await clearDone(db, family.id);
	}
};
