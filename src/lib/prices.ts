// Estimating what the shopping will cost and spotting cheaper alternatives to offers.
// Pure functions, shared by server and page.

import { categoryKey } from './categories';
import { matchOffer, type Offer } from './offers';

/** A normal shelf price the family has paid or looked up. Prices are in cents. */
export type KnownPrice = {
	id: string;
	key: string;
	store: string;
	product: string;
	price: number;
	seenOn: string;
	createdBy: string | null;
};

/**
 * How many of the product the quantity asks for: "3", "3x", "3 Stück", "2 Pck." count, while
 * amounts like "2 l" or "500 g" mean one pack.
 */
export function packs(quantity: string | null | undefined) {
	const m = (quantity ?? '')
		.trim()
		.match(/^(\d{1,2})\s*(x|×|stk\.?|stück|st\.?|pck\.?|packungen?|dosen?|flaschen?)?$/i);
	const n = m ? Number(m[1]) : 1;
	return n >= 1 ? n : 1;
}

/** Known prices that belong to a list entry: stored for it, or naming exactly that product. */
export function pricesFor(name: string, known: KnownPrice[]) {
	const key = categoryKey(name);
	return known.filter((k) => k.key === key || matchOffer(name, k.product)?.variant === '');
}

export type Estimate = {
	/** Price of one pack in cents. */
	price: number;
	store: string;
	packs: number;
	/** Where the price comes from: the cheapest offer or a known shelf price. */
	from: 'offer' | 'known';
	/** A known product that costs less than the best offer, e.g. a store brand. */
	cheaper: KnownPrice | null;
};

export type ItemWithQuantity = { id: string; name: string; quantity: string | null };

/**
 * Estimates each open entry at its cheapest known option, offer or shelf price, and sums it up.
 * Only prices from the family's stores count when it has chosen some.
 */
export function estimate(
	items: ItemWithQuantity[],
	byItem: Record<string, Offer[]>,
	known: KnownPrice[],
	stores: string[]
) {
	const inStores = (store: string) => !stores.length || stores.includes(store);
	const perItem: Record<string, Estimate> = {};
	let total = 0;

	for (const item of items) {
		const offer = (byItem[item.id] ?? []).find((o) => o.price != null && inStores(o.store));
		const shelf = pricesFor(item.name, known)
			.filter((k) => inStores(k.store))
			.sort((a, b) => a.price - b.price)[0];
		if (!offer && !shelf) continue;

		const useOffer = offer && (!shelf || offer.price! <= shelf.price);
		const price = useOffer ? offer.price! : shelf!.price;
		const store = useOffer ? offer.store : shelf!.store;
		const n = packs(item.quantity);
		perItem[item.id] = {
			price,
			store,
			packs: n,
			from: useOffer ? 'offer' : 'known',
			cheaper: offer && shelf && shelf.price < offer.price! ? shelf : null
		};
		total += price * n;
	}
	return { total, priced: Object.keys(perItem).length, perItem };
}
