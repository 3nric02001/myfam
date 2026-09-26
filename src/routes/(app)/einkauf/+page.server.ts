import { fail } from '@sveltejs/kit';
import { today } from '$lib/dates';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import {
	addItem,
	clearDone,
	deleteItem,
	forgetHistory,
	getCategoryOrder,
	restoreItem,
	setCategoryOrder,
	listHistory,
	listItemsWithCategory,
	setCategory,
	setDone,
	updateItem
} from '$lib/server/shopping';
import { isCategory, type CategoryId } from '$lib/categories';
import { memberIds } from '$lib/server/tasks';
import { marktguruEnabled } from '$lib/server/marktguru';
import { offersForList, purgeOffers } from '$lib/server/offers';
import { deleteKnownPrice, listKnownPrices, recordPrice } from '$lib/server/prices';
import { cancelPlan, getPlan, isTripDay, planTrip, tipFor, tripText } from '$lib/server/plan';
import { field } from '$lib/server/validation';
import { estimate } from '$lib/prices';
import { isStore, parsePrice } from '$lib/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	const items = await listItemsWithCategory(db, family.id);
	const day = today();
	const known = await listKnownPrices(db, family.id);
	const plan = await getPlan(db, family.id, day);
	const open = items.filter((i) => !i.done).map(({ id, name }) => ({ id, name }));
	// Streamed, so the list shows at once even when fetching offers takes a moment.
	const auto = marktguruEnabled();
	const offers = purgeOffers(db, day).then(async () => {
		// With a planned trip, the tip is for that day.
		const thisWeek = await offersForList(db, family.id, open, day, { auto, on: plan?.date });
		const nextWeek = await offersForList(db, family.id, open, day, { auto, week: 'next' });
		const openWithQuantity = items.filter((i) => !i.done);
		const cost = estimate(openWithQuantity, thisWeek.byItem, known, thisWeek.preferred);
		return { ...thisWeek, next: nextWeek.best, cost };
	});
	const onList = new Set(open.map((i) => i.name.trim().toLowerCase()));
	const history = (await listHistory(db, family.id)).filter(
		(h) => !onList.has(h.name.trim().toLowerCase())
	);
	const categoryOrder = await getCategoryOrder(db, family.id);
	return { items, offers, history, known, plan, categoryOrder, today: day };
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

	edit: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		const name = field(form, 'name');
		const quantity = field(form, 'quantity');
		if (!name) return fail(400, { message: 'Der Eintrag braucht einen Namen.' });
		if (name.length > 100 || quantity.length > 30) {
			return fail(400, { message: 'Der Eintrag ist zu lang.' });
		}
		await updateItem(db, family.id, field(form, 'id'), { name, quantity });
		return { edited: true };
	},

	toggle: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		await setDone(db, family.id, field(form, 'id'), field(form, 'done') === 'true', user.id);
	},

	delete: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		const row = await deleteItem(db, family.id, field(form, 'id'));
		// Sent back so the list can offer "Rückgängig" for a few seconds.
		return row
			? {
					deleted: {
						name: row.name,
						quantity: row.quantity ?? '',
						done: row.done,
						createdBy: row.createdBy ?? ''
					}
				}
			: undefined;
	},

	restore: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const name = field(form, 'name');
		const quantity = field(form, 'quantity');
		if (!name || name.length > 100 || quantity.length > 30) return fail(400);
		// Keep "von …" of the person who added it, as long as they are still in the family.
		const by = field(form, 'createdBy');
		const createdBy = (await memberIds(db, family.id)).includes(by) ? by : user.id;
		await restoreItem(db, family.id, createdBy, {
			name,
			quantity,
			done: field(form, 'done') === 'true'
		});
	},

	order: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		if (form.get('reset')) {
			await setCategoryOrder(db, family.id, null);
			return;
		}
		const order = form
			.getAll('order')
			.filter((v): v is CategoryId => typeof v === 'string' && isCategory(v));
		await setCategoryOrder(db, family.id, [...new Set(order)]);
	},

	category: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		const category = field(form, 'category');
		if (!isCategory(category)) return fail(400);
		await setCategory(db, family.id, field(form, 'name'), category);
	},

	price: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const store = field(form, 'store');
		const price = parsePrice(field(form, 'price'));
		const product = field(form, 'product');
		if (!isStore(store)) return fail(400, { message: 'Bitte wähle den Markt.' });
		if (price == null || price === 0) return fail(400, { message: 'Den Preis bitte wie 1,99.' });
		if (product.length > 100) return fail(400, { message: 'Der Produktname ist zu lang.' });
		await recordPrice(db, family.id, user.id, {
			name: field(form, 'name'),
			store,
			product,
			price,
			seenOn: today()
		});
		return { priced: field(form, 'name') };
	},

	plan: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const date = field(await request.formData(), 'date');
		const day = today();
		if (!isTripDay(date, day)) {
			return fail(400, { message: 'Bitte wähle einen Tag in den nächsten zwei Monaten.' });
		}
		const tip = await tipFor(db, family.id, date, day);
		await planTrip(db, family.id, user.id, { date, ...tripText(tip) });
		return { planned: date };
	},

	unplan: async ({ locals }) => {
		const { family } = requireFamily(locals);
		await cancelPlan(db, family.id);
	},

	forgetPrice: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		await deleteKnownPrice(db, family.id, field(await request.formData(), 'id'));
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
