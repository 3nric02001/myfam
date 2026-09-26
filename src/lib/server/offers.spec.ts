import { describe, expect, it, vi } from 'vitest';
import type { Offer } from '$lib/offers';
import {
	addManualOffer,
	autoOffers,
	deleteManualOffer,
	deleteRule,
	getRules,
	listRules,
	setRule,
	getOfferSettings,
	listManualOffers,
	offersForList,
	purgeOffers,
	saveOfferSettings
} from './offers';
import { resetKeys, searchMarktguru, toOffers } from './marktguru';
import { seedFamily, testDb } from './test/setup';

const TODAY = '2026-09-24';

describe('offer settings', () => {
	it('saves stores and postcode per family', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		expect(await getOfferSettings(db, a.family.id)).toEqual({ zip: null, stores: [] });

		await saveOfferSettings(db, a.family.id, { zip: '80331', stores: ['lidl'] });
		await saveOfferSettings(db, a.family.id, { zip: '80331', stores: ['lidl', 'rewe'] });
		expect(await getOfferSettings(db, a.family.id)).toEqual({
			zip: '80331',
			stores: ['lidl', 'rewe']
		});
		expect(await getOfferSettings(db, b.family.id)).toEqual({ zip: null, stores: [] });
	});
});

describe('answers about uncertain offers', () => {
	it('stores one answer per term and variant and family', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		const rule = { term: 'milch', variant: 'muellermilch', example: 'Müllermilch Banane' };
		await setRule(db, a.family.id, { ...rule, fits: true });
		await setRule(db, a.family.id, { ...rule, fits: false });
		expect(await getRules(db, a.family.id)).toEqual({ milch: { muellermilch: false } });
		expect(await getRules(db, b.family.id)).toEqual({});
		expect(await listRules(db, a.family.id)).toEqual([{ ...rule, fits: false }]);

		await deleteRule(db, a.family.id, 'milch', 'muellermilch');
		expect(await getRules(db, a.family.id)).toEqual({});
	});
});

describe('manual offers', () => {
	it('keeps families apart and drops expired offers', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		const milk = await addManualOffer(db, a.family.id, a.owner.id, {
			store: 'lidl',
			product: ' Milch ',
			price: 99,
			validUntil: '2026-09-26'
		});
		await addManualOffer(db, a.family.id, a.owner.id, {
			store: 'lidl',
			product: 'Brot',
			price: null,
			validUntil: '2026-09-20'
		});

		const list = await listManualOffers(db, a.family.id, TODAY);
		expect(list.map((o) => [o.product, o.createdBy])).toEqual([['Milch', 'anna']]);
		expect(await listManualOffers(db, b.family.id, TODAY)).toEqual([]);

		await deleteManualOffer(db, b.family.id, milk.id);
		expect(await listManualOffers(db, a.family.id, TODAY)).toHaveLength(1);

		await purgeOffers(db, '2026-09-27');
		expect(await listManualOffers(db, a.family.id, '2000-01-01')).toEqual([]);
	});
});

describe('automatic offers', () => {
	const lidlMilk: Offer = {
		store: 'lidl',
		product: 'Milbona H-Milch',
		price: 95,
		oldPrice: 115,
		validUntil: '2026-09-27',
		source: 'marktguru'
	};

	it('asks the source once per term and postcode, then uses the cache', async () => {
		const db = testDb();
		const search = vi.fn(async () => [lidlMilk]);
		const first = await autoOffers(db, '80331', ['milch'], TODAY, search);
		const second = await autoOffers(db, '80331', ['milch'], TODAY, search);
		expect(first).toEqual({ offers: [lidlMilk], failed: false });
		expect(second.offers).toEqual([lidlMilk]);
		expect(search).toHaveBeenCalledTimes(1);

		await autoOffers(db, '10115', ['milch'], TODAY, search);
		expect(search).toHaveBeenCalledTimes(2);
	});

	it('reports a failing source and stops asking it', async () => {
		const db = testDb();
		const search = vi.fn(async () => {
			throw new Error('down');
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await autoOffers(db, '80331', ['milch', 'brot'], TODAY, search)).toEqual({
			offers: [],
			failed: true
		});
		expect(search).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it('combines manual and automatic offers into one recommendation', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		await saveOfferSettings(db, family.id, { zip: '80331', stores: ['lidl', 'rewe'] });
		await addManualOffer(db, family.id, owner.id, {
			store: 'rewe',
			product: 'Kaffee',
			price: 499,
			validUntil: '2026-09-26'
		});
		const items = [
			{ id: '1', name: 'H-Milch' },
			{ id: '2', name: 'Kaffee' }
		];

		const off = await offersForList(db, family.id, items, TODAY, { auto: false });
		expect(off.best).toEqual({ stores: ['rewe'], covered: 1 });

		// The offer ends on Saturday, so next week has none.
		const next = await offersForList(db, family.id, items, TODAY, { auto: false, week: 'next' });
		expect(next.best).toBe(null);

		const search = vi.fn(async () => [lidlMilk]);
		const on = await offersForList(db, family.id, items, TODAY, { auto: true, search });
		expect(search).toHaveBeenCalledWith('milch', '80331', TODAY);
		expect(on.best).toEqual({ stores: ['lidl', 'rewe'], covered: 2 });
		expect(on.configured).toBe(true);
	});
});

describe('marktguru offers', () => {
	it('maps one offer to every store that has it and skips expired ones', () => {
		const raw = {
			price: 0.95,
			oldPrice: 1.15,
			brand: { name: 'Milbona' },
			product: { name: 'H-Milch' },
			advertisers: [{ uniqueName: 'lidl' }, { uniqueName: 'penny' }],
			validityDates: [{ from: '2026-09-21T22:00:00Z', to: '2026-09-27T21:59:59Z' }]
		};
		expect(toOffers(raw, TODAY)).toEqual([
			{
				store: 'lidl',
				product: 'Milbona H-Milch',
				price: 95,
				oldPrice: 115,
				validFrom: '2026-09-22',
				validUntil: '2026-09-27',
				source: 'marktguru',
				url: 'https://www.marktguru.de/'
			},
			{
				store: 'penny',
				product: 'Milbona H-Milch',
				price: 95,
				oldPrice: 115,
				validFrom: '2026-09-22',
				validUntil: '2026-09-27',
				source: 'marktguru',
				url: 'https://www.marktguru.de/'
			}
		]);
		expect(toOffers(raw, '2026-09-28')).toEqual([]);
	});
});

describe('marktguru search', () => {
	it('reads the keys from the website and sends them with the search', async () => {
		resetKeys();
		const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			if (String(url) === 'https://www.marktguru.de/') {
				return new Response(
					'<script type="application/json">{"other":1}</script>' +
						'<script type="application/json">{"config":{"apiKey":"A","clientKey":"C"}}</script>'
				);
			}
			expect(String(url)).toMatch(/q=(milch|brot)/);
			expect(String(url)).toContain('zipCode=80331');
			expect(init?.headers).toEqual({ 'x-apikey': 'A', 'x-clientkey': 'C' });
			return Response.json({ results: [] });
		});
		expect(await searchMarktguru('milch', '80331', TODAY, fetchFn as typeof fetch)).toEqual([]);
		await searchMarktguru('brot', '80331', TODAY, fetchFn as typeof fetch);
		// The keys are fetched once and reused.
		expect(
			fetchFn.mock.calls.filter(([u]) => String(u) === 'https://www.marktguru.de/')
		).toHaveLength(1);
	});
});
