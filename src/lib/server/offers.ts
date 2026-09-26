import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { DB } from './db/client';
import { offer, offerMatchRule, offerSearchCache, offerSettings, user } from './db/schema';
import {
	recommend,
	runsDuring,
	term,
	weekRange,
	type Item,
	type Offer,
	type Rules,
	type Week
} from '$lib/offers';
import { searchMarktguru } from './marktguru';

// Every query is scoped to a family, like the shopping list itself.

const CACHE_MS = 6 * 3600_000;
// Raised when cached offers lack fields the pages need, so old entries are fetched again.
const CACHE_VERSION = 2;
/** Upper bound of searches per page load, so a long list cannot flood the source. */
const MAX_SEARCHES = 30;

export async function getOfferSettings(db: DB, familyId: string) {
	const [row] = await db
		.select({ zip: offerSettings.zip, stores: offerSettings.stores })
		.from(offerSettings)
		.where(eq(offerSettings.familyId, familyId));
	return row ?? { zip: null, stores: [] as string[] };
}

export async function saveOfferSettings(
	db: DB,
	familyId: string,
	input: { zip: string | null; stores: string[] }
) {
	const values = { zip: input.zip, stores: input.stores, updatedAt: new Date() };
	await db
		.insert(offerSettings)
		.values({ familyId, ...values })
		.onConflictDoUpdate({ target: offerSettings.familyId, set: values });
}

/** Offers entered by hand that are still valid today. */
export async function listManualOffers(db: DB, familyId: string, today: string) {
	return db
		.select({
			id: offer.id,
			store: offer.store,
			product: offer.product,
			price: offer.price,
			validFrom: offer.validFrom,
			validUntil: offer.validUntil,
			url: offer.url,
			createdBy: user.name
		})
		.from(offer)
		.leftJoin(user, eq(offer.createdBy, user.id))
		.where(and(eq(offer.familyId, familyId), gte(offer.validUntil, today)))
		.orderBy(asc(offer.validFrom), asc(offer.store), asc(offer.product));
}

export async function addManualOffer(
	db: DB,
	familyId: string,
	createdBy: string,
	input: {
		store: string;
		product: string;
		price: number | null;
		validFrom?: string | null;
		validUntil: string;
		url?: string | null;
	}
) {
	const [row] = await db
		.insert(offer)
		.values({ familyId, createdBy, ...input, product: input.product.trim() })
		.returning();
	return row;
}

export async function deleteManualOffer(db: DB, familyId: string, id: string) {
	await db.delete(offer).where(and(eq(offer.familyId, familyId), eq(offer.id, id)));
}

/** Removes expired hand-entered offers and old cache entries. */
export async function purgeOffers(db: DB, today: string) {
	await db.delete(offer).where(lt(offer.validUntil, today));
	await db
		.delete(offerSearchCache)
		.where(lt(offerSearchCache.fetchedAt, new Date(Date.now() - CACHE_MS)));
}

type Search = (query: string, zip: string, today: string) => Promise<Offer[]>;

/**
 * Automatic offers for the given search terms, from the cache when it is fresh.
 * Returns whether any search failed, so the page can say the data may be incomplete.
 */
export async function autoOffers(
	db: DB,
	zip: string,
	queries: string[],
	today: string,
	search: Search = searchMarktguru
) {
	const offers: Offer[] = [];
	let failed = false;
	const fresh = new Date(Date.now() - CACHE_MS);

	for (const term of queries.slice(0, MAX_SEARCHES)) {
		const query = `v${CACHE_VERSION}:${term}`;
		const [cached] = await db
			.select()
			.from(offerSearchCache)
			.where(and(eq(offerSearchCache.zip, zip), eq(offerSearchCache.query, query)));
		if (cached && cached.fetchedAt >= fresh) {
			offers.push(...(cached.results as Offer[]).filter((o) => o.validUntil >= today));
			continue;
		}
		try {
			const results = await search(term, zip, today);
			const values = { results, fetchedAt: new Date() };
			await db
				.insert(offerSearchCache)
				.values({ zip, query, ...values })
				.onConflictDoUpdate({
					target: [offerSearchCache.zip, offerSearchCache.query],
					set: values
				});
			offers.push(...results);
		} catch (e) {
			console.warn('Angebote konnten nicht geladen werden:', (e as Error).message);
			failed = true;
			// After the first failure the source is most likely down; don't try every item.
			break;
		}
	}
	return { offers, failed };
}

/** The family's answers to "does this count?", by term and variant. */
export async function getRules(db: DB, familyId: string): Promise<Rules> {
	const rows = await db.select().from(offerMatchRule).where(eq(offerMatchRule.familyId, familyId));
	const rules: Rules = {};
	for (const r of rows) (rules[r.term] ??= {})[r.variant] = r.fits;
	return rules;
}

export async function listRules(db: DB, familyId: string) {
	return db
		.select({
			term: offerMatchRule.term,
			variant: offerMatchRule.variant,
			example: offerMatchRule.example,
			fits: offerMatchRule.fits
		})
		.from(offerMatchRule)
		.where(eq(offerMatchRule.familyId, familyId))
		.orderBy(asc(offerMatchRule.term), asc(offerMatchRule.example));
}

export async function setRule(
	db: DB,
	familyId: string,
	input: { term: string; variant: string; example: string; fits: boolean }
) {
	await db
		.insert(offerMatchRule)
		.values({ familyId, ...input })
		.onConflictDoUpdate({
			target: [offerMatchRule.familyId, offerMatchRule.term, offerMatchRule.variant],
			set: { fits: input.fits, example: input.example }
		});
}

export async function deleteRule(db: DB, familyId: string, t: string, variant: string) {
	await db
		.delete(offerMatchRule)
		.where(
			and(
				eq(offerMatchRule.familyId, familyId),
				eq(offerMatchRule.term, t),
				eq(offerMatchRule.variant, variant)
			)
		);
}

/** Everything the shopping page needs to show offers for the open items. */
export async function offersForList(
	db: DB,
	familyId: string,
	items: Item[],
	today: string,
	options: { auto: boolean; week?: Week; on?: string; search?: Search }
) {
	const settings = await getOfferSettings(db, familyId);
	const manual: Offer[] = (await listManualOffers(db, familyId, today)).map((o) => ({
		store: o.store,
		product: o.product,
		price: o.price,
		oldPrice: null,
		validFrom: o.validFrom,
		validUntil: o.validUntil,
		source: 'manual',
		url: o.url,
		by: o.createdBy
	}));

	let auto: Offer[] = [];
	let failed = false;
	if (options.auto && settings.zip && settings.stores.length && items.length) {
		const queries = [...new Set(items.map((i) => term(i.name)).filter(Boolean))];
		({ offers: auto, failed } = await autoOffers(db, settings.zip, queries, today, options.search));
	}

	// A planned trip looks at the offers of that one day, otherwise at the whole week.
	const range = options.on
		? { from: options.on, to: options.on }
		: weekRange(today, options.week ?? 'this');
	const offers = [...manual, ...auto].filter((o) => runsDuring(o, range));
	return {
		configured: settings.stores.length > 0,
		preferred: settings.stores,
		failed,
		range,
		...recommend(items, offers, settings.stores, await getRules(db, familyId))
	};
}
