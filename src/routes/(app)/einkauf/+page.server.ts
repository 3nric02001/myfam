import { fail } from '@sveltejs/kit';
import { today } from '$lib/dates';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import {
	addItem,
	clearDone,
	deleteItem,
	forgetHistory,
	listHistory,
	listItemsWithCategory,
	setCategory,
	setDone
} from '$lib/server/shopping';
import { isCategory } from '$lib/categories';
import { marktguruEnabled } from '$lib/server/marktguru';
import { offersForList, purgeOffers } from '$lib/server/offers';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	const items = await listItemsWithCategory(db, family.id);
	const day = today();
	const open = items.filter((i) => !i.done).map(({ id, name }) => ({ id, name }));
	// Streamed, so the list shows at once even when fetching offers takes a moment.
	const auto = marktguruEnabled();
	const offers = purgeOffers(db, day).then(async () => {
		const thisWeek = await offersForList(db, family.id, open, day, { auto });
		const nextWeek = await offersForList(db, family.id, open, day, { auto, week: 'next' });
		return { ...thisWeek, next: nextWeek.best };
	});
	const onList = new Set(open.map((i) => i.name.trim().toLowerCase()));
	const history = (await listHistory(db, family.id)).filter(
		(h) => !onList.has(h.name.trim().toLowerCase())
	);
	return { items, offers, history };
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

	category: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		const category = field(form, 'category');
		if (!isCategory(category)) return fail(400);
		await setCategory(db, family.id, field(form, 'name'), category);
	},

	forget: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		await forgetHistory(db, family.id, field(await request.formData(), 'key'));
	},

	clearDone: async ({ locals }) => {
		const { family } = requireFamily(locals);
		await clearDone(db, family.id);
	}
};
