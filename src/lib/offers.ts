// Matching offers to the shopping list and recommending where to shop.
// Pure functions, shared by server and page, so they are easy to test.

/** Stores a family can pick. The id is the retailer name marktguru uses. */
export const STORES = [
	{ id: 'aldi-nord', label: 'Aldi Nord' },
	{ id: 'aldi-sued', label: 'Aldi Süd' },
	{ id: 'lidl', label: 'Lidl' },
	{ id: 'rewe', label: 'REWE' },
	{ id: 'edeka', label: 'Edeka' },
	{ id: 'penny', label: 'Penny' },
	{ id: 'netto-marken-discount', label: 'Netto' },
	{ id: 'kaufland', label: 'Kaufland' },
	{ id: 'norma', label: 'Norma' },
	{ id: 'globus', label: 'Globus' },
	{ id: 'marktkauf', label: 'Marktkauf' },
	{ id: 'dm', label: 'dm' },
	{ id: 'rossmann', label: 'Rossmann' }
] as const;

export type StoreId = (typeof STORES)[number]['id'];

export function isStore(id: string): id is StoreId {
	return STORES.some((s) => s.id === id);
}

export function storeLabel(id: string) {
	return STORES.find((s) => s.id === id)?.label ?? id;
}

/** One offer, entered by hand or fetched automatically. Prices are in cents. */
export type Offer = {
	store: string;
	product: string;
	price: number | null;
	oldPrice: number | null;
	/** Last valid day, 'YYYY-MM-DD'. */
	validUntil: string;
	source: 'manual' | 'marktguru';
};

export type Item = { id: string; name: string };

/** Lowercase, umlauts spelled out, only letters and digits, split into words. */
export function words(text: string) {
	return text
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/**
 * An offer fits a list item when every word of the item appears in the offer's product name,
 * also as part of a longer word: "Milch" fits "Weihenstephan H-Milch" and "Vollmilch".
 */
export function fits(itemName: string, product: string) {
	const wanted = words(itemName).filter((w) => w.length >= 2);
	if (!wanted.length) return false;
	const text = words(product).join(' ');
	return wanted.every((w) => text.includes(w));
}

function saving(offer: Offer) {
	return offer.oldPrice != null && offer.price != null && offer.oldPrice > offer.price
		? offer.oldPrice - offer.price
		: 0;
}

/** Cheapest first; offers without a price last. */
function byPrice(a: Offer, b: Offer) {
	return (a.price ?? Infinity) - (b.price ?? Infinity);
}

export type StoreResult = {
	store: string;
	/** The best offer of this store for every list item it has one for. */
	hits: { item: Item; offer: Offer }[];
	/** Sum of known savings in cents. */
	saving: number;
};

export type Recommendation = {
	/** All fitting offers per item id, cheapest first. */
	byItem: Record<string, Offer[]>;
	/** Stores with at least one offer, most items first. */
	stores: StoreResult[];
	/** Where to go: one store, or two when a second stop adds more offers. */
	best: { stores: string[]; covered: number } | null;
};

/** Finds the offers for each item among the chosen stores and picks where to shop. */
export function recommend(items: Item[], offers: Offer[], stores: string[]): Recommendation {
	const byItem: Record<string, Offer[]> = {};
	const perStore = new Map<string, StoreResult>();

	for (const item of items) {
		const found = offers
			.filter((o) => stores.includes(o.store) && fits(item.name, o.product))
			.sort(byPrice);
		if (!found.length) continue;
		byItem[item.id] = found;
		for (const store of stores) {
			const offer = found.find((o) => o.store === store);
			if (!offer) continue;
			const result = perStore.get(store) ?? { store, hits: [], saving: 0 };
			result.hits.push({ item, offer });
			result.saving += saving(offer);
			perStore.set(store, result);
		}
	}

	const ranked = [...perStore.values()].sort(
		(a, b) => b.hits.length - a.hits.length || b.saving - a.saving
	);
	if (!ranked.length) return { byItem, stores: ranked, best: null };

	// A second stop is only worth it if it adds items the first store has no offer for.
	let best = { stores: [ranked[0].store], covered: ranked[0].hits.length, saving: 0 };
	for (let i = 0; i < ranked.length; i++) {
		for (let j = i + 1; j < ranked.length; j++) {
			const ids = new Set([...ranked[i].hits, ...ranked[j].hits].map((h) => h.item.id));
			const covered = ids.size;
			const pairSaving = ranked[i].saving + ranked[j].saving;
			if (
				covered > best.covered ||
				(covered === best.covered && best.stores.length === 2 && pairSaving > best.saving)
			) {
				best = { stores: [ranked[i].store, ranked[j].store], covered, saving: pairSaving };
			}
		}
	}
	return { byItem, stores: ranked, best: { stores: best.stores, covered: best.covered } };
}

export function formatPrice(cents: number | null) {
	if (cents == null) return '';
	return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Parses "1,99", "1.99" or "1,99 €" into cents. */
export function parsePrice(text: string): number | null {
	const m = text.replace(/\s|€/g, '').match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/);
	if (!m) return null;
	return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}
