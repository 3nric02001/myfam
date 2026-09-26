import { fail } from '@sveltejs/kit';
import { today } from '$lib/dates';
import { isStore, parsePrice } from '$lib/offers';
import { guessEntry, parseReceipt, tidy } from '$lib/receipt';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { getOfferSettings } from '$lib/server/offers';
import { readText } from '$lib/server/ocr';
import { recordPrice } from '$lib/server/prices';
import { listHistory, listItems } from '$lib/server/shopping';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_LINES = 80;

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	return { preferred: (await getOfferSettings(db, family.id)).stores, today: today() };
};

/** Names a receipt line can be filed under: what is on the list first, then earlier purchases. */
async function entryNames(familyId: string) {
	const onList = (await listItems(db, familyId)).map((i) => i.name);
	const before = (await listHistory(db, familyId)).map((h) => h.name);
	return [...new Set([...onList, ...before])];
}

export const actions: Actions = {
	read: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		const photo = (await request.formData()).get('photo');
		if (!(photo instanceof File) || !photo.size) {
			return fail(400, { message: 'Bitte fotografiere den Kassenzettel.' });
		}
		if (photo.size > MAX_PHOTO || !photo.type.startsWith('image/')) {
			return fail(400, { message: 'Das Foto ist zu groß oder kein Bild.' });
		}
		let text: string;
		try {
			text = await readText(Buffer.from(await photo.arrayBuffer()));
		} catch (e) {
			console.error('Kassenzettel lesen:', e);
			return fail(500, { message: 'Das Foto konnte nicht gelesen werden.' });
		}
		const receipt = parseReceipt(text);
		if (!receipt.lines.length) {
			return fail(422, {
				message:
					'Auf dem Foto habe ich keine Preise gefunden. Am besten gerade, hell und nah fotografieren.'
			});
		}
		const names = await entryNames(family.id);
		return {
			receipt: {
				store: receipt.store,
				date: receipt.date && receipt.date <= today() ? receipt.date : today(),
				lines: receipt.lines.slice(0, MAX_LINES).map((l) => {
					const entry = guessEntry(l.text, names);
					return { ...l, product: tidy(l.text), name: entry ?? tidy(l.text), known: !!entry };
				})
			}
		};
	},

	save: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const store = field(form, 'store');
		const date = field(form, 'date');
		if (!isStore(store)) return fail(400, { message: 'Bitte wähle den Markt.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) {
			return fail(400, { message: 'Bitte gib das Einkaufsdatum an.' });
		}
		const count = Math.min(Number(field(form, 'lines')) || 0, MAX_LINES);
		let saved = 0;
		for (let i = 0; i < count; i++) {
			if (field(form, `keep-${i}`) !== 'on') continue;
			const name = field(form, `name-${i}`).slice(0, 100);
			const product = field(form, `product-${i}`).slice(0, 100);
			const price = parsePrice(field(form, `price-${i}`));
			if (!name || !price) continue;
			if (
				await recordPrice(db, family.id, user.id, { name, store, product, price, seenOn: date })
			) {
				saved++;
			}
		}
		return { saved };
	}
};
