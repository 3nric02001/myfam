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
	/** First valid day, 'YYYY-MM-DD'; null when unknown (counts as already running). */
	validFrom?: string | null;
	/** Last valid day, 'YYYY-MM-DD'. */
	validUntil: string;
	source: 'manual' | 'marktguru';
	/** Where to see it: the leaflet link someone entered, or the source website. */
	url?: string | null;
	/** A picture of the offer from the leaflet. */
	image?: string | null;
	/** Who entered it by hand. */
	by?: string | null;
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

/** How a list entry is looked up: its words without amounts, e.g. "milch" for "Milch 3,5 %". */
export function term(name: string) {
	return words(name)
		.filter((w) => w.length >= 2 && !/\d/.test(w))
		.join(' ');
}

/** Drops simple plural endings so "Bananen" and "Banane" compare equal. */
function stem(word: string) {
	return word.length > 4 ? word.replace(/(en|n|e|s)$/, '') : word;
}

/**
 * Words that name a different kind of product. An offer containing one the list entry does not
 * is probably something else: "Milch" is not "Milka Alpenmilch Schokolade".
 */
const OTHER_KINDS = new Set(
	(
		'schokolade schoko riegel eis joghurt jogurt pudding dessert drink getraenk shake keks kekse ' +
		'creme sauce sosse kuchen torte bonbon bonbons praline pralinen aufstrich pulver likoer chips ' +
		'cracker waffel waffeln snack mix kaese wurst reis brot broetchen seife shampoo duschgel ' +
		'lotion spuelmittel waschmittel tee kaffee saft limonade bier wein milch'
	).split(' ')
);

export type Match = {
	/**
	 * What makes this offer uncertain: the longer words the entry is part of ("vollmilch") and
	 * words of another kind of product ("schokolade"). Empty for an exact match.
	 */
	variant: string;
};

/**
 * Checks whether an offer is the thing on the list. Each word of the entry must be a word of the
 * product or the end of a compound word ("milch" in "Vollmilch"), never its start or middle:
 * "Milchreis" and "Vollmilchschokolade" are other products.
 * Returns null when it does not fit, else how sure the match is.
 */
export function matchOffer(name: string, product: string): Match | null {
	const wanted = term(name).split(' ').filter(Boolean);
	if (!wanted.length) return null;
	const have = words(product);
	const uncertain = new Set<string>();

	for (const w of wanted) {
		const exact = have.some((o) => stem(o) === stem(w));
		if (exact) continue;
		const compound = have.find((o) => o.length > w.length + 1 && stem(o).endsWith(stem(w)));
		if (!compound) return null;
		uncertain.add(compound);
	}
	// Long kind words also count at the end of a compound ("Müllermilch" is a milk drink, so it
	// is not "Bananen"); short ones only on their own, or "eis" would hit "Reis" and "Preis".
	const isKind = (o: string) =>
		OTHER_KINDS.has(o) || [...OTHER_KINDS].some((k) => k.length >= 5 && o.endsWith(k));
	for (const o of have) {
		if (isKind(o) && !wanted.some((w) => stem(o).endsWith(stem(w)))) uncertain.add(o);
	}
	return { variant: [...uncertain].sort().join(' ') };
}

/** Answers the family gave: per entry term and variant, whether such offers count. */
export type Rules = Record<string, Record<string, boolean>>;

/** An uncertain kind of offer for an entry that nobody has decided on yet. */
export type Question = {
	itemId: string;
	name: string;
	term: string;
	variant: string;
	example: Offer;
};

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
	/** Uncertain matches to ask about. They don't count until someone says they fit. */
	questions: Question[];
};

/**
 * Finds the offers for each item among the chosen stores and picks where to shop.
 * Exact matches count; uncertain ones count only when the family said so in `rules`,
 * otherwise they become a question.
 */
export function recommend(
	items: Item[],
	offers: Offer[],
	stores: string[],
	rules: Rules = {}
): Recommendation {
	const byItem: Record<string, Offer[]> = {};
	const perStore = new Map<string, StoreResult>();
	const questions: Question[] = [];
	const asked = new Set<string>();

	for (const item of items) {
		const t = term(item.name);
		const found: Offer[] = [];
		for (const offer of [...offers].sort(byPrice)) {
			if (!stores.includes(offer.store)) continue;
			const match = matchOffer(item.name, offer.product);
			if (!match) continue;
			const answer = match.variant ? rules[t]?.[match.variant] : true;
			if (answer === true) found.push(offer);
			else if (answer === undefined && !asked.has(`${t}|${match.variant}`)) {
				asked.add(`${t}|${match.variant}`);
				questions.push({
					itemId: item.id,
					name: item.name,
					term: t,
					variant: match.variant,
					example: offer
				});
			}
		}
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
	if (!ranked.length) return { byItem, stores: ranked, best: null, questions };

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
	return {
		byItem,
		stores: ranked,
		best: { stores: best.stores, covered: best.covered },
		questions
	};
}

export type Week = 'this' | 'next';

/** Leaflet weeks run until Saturday. */
export function weekEnd(day: string) {
	const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
	return shiftDay(day, (6 - weekday + 7) % 7);
}

function shiftDay(day: string, days: number) {
	return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** First and last day of the week: from today to Saturday, or next Monday to Saturday. */
export function weekRange(today: string, week: Week) {
	const end = weekEnd(today);
	return week === 'this'
		? { from: today, to: end }
		: { from: shiftDay(end, 2), to: shiftDay(end, 7) };
}

/** Whether an offer runs on at least one day of the range. */
export function runsDuring(
	offer: Pick<Offer, 'validFrom' | 'validUntil'>,
	range: { from: string; to: string }
) {
	return (offer.validFrom ?? '') <= range.to && offer.validUntil >= range.from;
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
