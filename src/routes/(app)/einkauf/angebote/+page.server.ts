import { fail } from '@sveltejs/kit';
import { addDays, today } from '$lib/dates';
import { isStore, parsePrice } from '$lib/offers';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { marktguruEnabled } from '$lib/server/marktguru';
import {
	addManualOffer,
	deleteManualOffer,
	getOfferSettings,
	listManualOffers,
	offersForList,
	purgeOffers,
	saveOfferSettings
} from '$lib/server/offers';
import { listItems } from '$lib/server/shopping';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

/** Leaflet offers usually run until Saturday. */
function nextSaturday(day: string) {
	const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
	return addDays(day, (6 - weekday + 7) % 7);
}

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	const day = today();
	await purgeOffers(db, day);
	const items = (await listItems(db, family.id))
		.filter((i) => !i.done)
		.map(({ id, name }) => ({ id, name }));
	return {
		items,
		today: day,
		defaultUntil: nextSaturday(day),
		auto: marktguruEnabled(),
		settings: await getOfferSettings(db, family.id),
		manual: await listManualOffers(db, family.id, day),
		offers: offersForList(db, family.id, items, day, { auto: marktguruEnabled() })
	};
};

export const actions: Actions = {
	settings: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const form = await request.formData();
		const zip = field(form, 'zip');
		if (zip && !/^\d{5}$/.test(zip)) {
			return fail(400, { message: 'Die Postleitzahl hat 5 Ziffern.' });
		}
		const stores = form.getAll('stores').filter((s): s is string => typeof s === 'string');
		await saveOfferSettings(db, family.id, { zip: zip || null, stores: stores.filter(isStore) });
		return { saved: true };
	},

	add: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const store = field(form, 'store');
		const product = field(form, 'product');
		const priceText = field(form, 'price');
		const validUntil = field(form, 'validUntil');
		const price = priceText ? parsePrice(priceText) : null;
		if (!isStore(store)) return fail(400, { message: 'Bitte wähle einen Markt.' });
		if (!product || product.length > 100) {
			return fail(400, { message: 'Bitte gib das Produkt an (max. 100 Zeichen).' });
		}
		if (priceText && price == null) return fail(400, { message: 'Den Preis bitte wie 1,99.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || validUntil < today()) {
			return fail(400, { message: 'Bitte gib an, bis wann das Angebot gilt.' });
		}
		await addManualOffer(db, family.id, user.id, { store, product, price, validUntil });
		return { added: true };
	},

	delete: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		await deleteManualOffer(db, family.id, field(await request.formData(), 'id'));
	}
};
