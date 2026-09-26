import { describe, expect, it } from 'vitest';
import {
	matchOffer,
	offerLink,
	parsePrice,
	recommend,
	runsDuring,
	slug,
	term,
	weekRange,
	type Offer
} from './offers';

const offer = (
	store: string,
	product: string,
	price: number,
	oldPrice: number | null = null
): Offer => ({
	store,
	product,
	price,
	oldPrice,
	validUntil: '2026-09-27',
	source: 'manual'
});

describe('matchOffer', () => {
	const variant = (name: string, product: string) => matchOffer(name, product)?.variant ?? null;

	it('is sure about a whole word, also across umlauts and plurals', () => {
		expect(variant('Milch', 'Weihenstephan H-Milch 1 l')).toBe('');
		expect(variant('Käse', 'Gouda Käse am Stück')).toBe('');
		expect(variant('Bananen', 'Chiquita Banane')).toBe('');
		expect(variant('Butter Kerrygold', 'Kerrygold Original Irische Butter')).toBe('');
	});

	it('asks about compound words that end in the entry', () => {
		expect(variant('Milch', 'Vollmilch 3,5 %')).toBe('vollmilch');
		expect(variant('Milch', 'Müllermilch Banane')).toBe('muellermilch');
	});

	it('does not match when the entry is only the start or middle of a word', () => {
		expect(variant('Milch', 'Milka Vollmilchschokolade')).toBe(null);
		expect(variant('Milch', 'Milchreis Klassik')).toBe(null);
		expect(variant('Butter Kerrygold', 'Meggle Butter')).toBe(null);
		expect(variant('Brot', 'Milch')).toBe(null);
		expect(variant('!', 'Milch')).toBe(null);
	});

	it('asks when the offer names another kind of product', () => {
		expect(variant('Milch', 'Milka Alpenmilch Schokolade')).toBe('alpenmilch schokolade');
		expect(variant('Milch', 'Milch Schoko Drink')).toBe('drink schoko');
		expect(variant('Bananen', 'Müllermilch Banane 400 ml')).toBe('muellermilch');
		expect(variant('Sahne', 'Sahne Joghurt Kirsche')).toBe('joghurt');
		expect(variant('Butter', 'Rama Butterkeks')).toBe(null);
		expect(variant('Reis', 'Reis zum Preis von')).toBe('');
	});

	it('ignores amounts in the entry', () => {
		expect(term('Milch 3,5 %')).toBe('milch');
		expect(variant('Milch 1,5%', 'H-Milch')).toBe('');
	});
});

describe('parsePrice', () => {
	it('reads German and English decimal prices', () => {
		expect(parsePrice('1,99')).toBe(199);
		expect(parsePrice('1.5 €')).toBe(150);
		expect(parsePrice('3')).toBe(300);
		expect(parsePrice('abc')).toBe(null);
		expect(parsePrice('1,999')).toBe(null);
	});
});

describe('recommend', () => {
	const items = [
		{ id: 'm', name: 'Milch' },
		{ id: 'b', name: 'Butter' },
		{ id: 'k', name: 'Kaffee' },
		{ id: 'x', name: 'Brot' }
	];

	it('ignores stores the family does not use and lists the cheapest offer first', () => {
		const r = recommend(
			items,
			[offer('lidl', 'Milch', 99), offer('rewe', 'H-Milch', 89), offer('aldi-sued', 'Milch', 49)],
			['lidl', 'rewe']
		);
		expect(r.byItem.m.map((o) => o.store)).toEqual(['rewe', 'lidl']);
		expect(r.stores.map((s) => s.store).sort()).toEqual(['lidl', 'rewe']);
	});

	it('recommends the store with the most offers', () => {
		const r = recommend(
			items,
			[offer('lidl', 'Milch', 99), offer('lidl', 'Butter', 199), offer('rewe', 'Milch', 89)],
			['lidl', 'rewe']
		);
		expect(r.best).toEqual({ stores: ['lidl'], covered: 2 });
	});

	it('adds a second store only when it covers more items', () => {
		const r = recommend(
			items,
			[
				offer('lidl', 'Milch', 99),
				offer('lidl', 'Butter', 199),
				offer('rewe', 'Kaffee', 499),
				offer('penny', 'Milch', 79)
			],
			['lidl', 'rewe', 'penny']
		);
		expect(r.best).toEqual({ stores: ['lidl', 'rewe'], covered: 3 });
	});

	it('breaks ties by savings', () => {
		const r = recommend(
			items,
			[offer('lidl', 'Milch', 99, 109), offer('rewe', 'Milch', 99, 149)],
			['lidl', 'rewe']
		);
		expect(r.best).toEqual({ stores: ['rewe'], covered: 1 });
		expect(r.stores[0].saving).toBe(50);
	});

	it('has no recommendation without offers', () => {
		expect(recommend(items, [], ['lidl']).best).toBe(null);
	});

	it('asks once about uncertain offers and counts them only when confirmed', () => {
		const offers = [
			offer('lidl', 'Müllermilch Banane', 89),
			offer('rewe', 'Müllermilch Schoko', 99),
			offer('rewe', 'Vollmilch', 109)
		];
		const open = recommend(items, offers, ['lidl', 'rewe']);
		expect(open.byItem.m).toBeUndefined();
		expect(open.questions.map((q) => [q.term, q.variant, q.example.product])).toEqual([
			['milch', 'muellermilch', 'Müllermilch Banane'],
			['milch', 'muellermilch schoko', 'Müllermilch Schoko'],
			['milch', 'vollmilch', 'Vollmilch']
		]);

		const answered = recommend(items, offers, ['lidl', 'rewe'], {
			milch: { muellermilch: false, 'muellermilch schoko': false, vollmilch: true }
		});
		expect(answered.questions).toEqual([]);
		expect(answered.byItem.m.map((o) => o.product)).toEqual(['Vollmilch']);
		expect(answered.best).toEqual({ stores: ['rewe'], covered: 1 });
	});
});

describe('weeks', () => {
	it('runs this week until Saturday and next week from Monday to Saturday', () => {
		// 2026-09-24 is a Thursday.
		expect(weekRange('2026-09-24', 'this')).toEqual({ from: '2026-09-24', to: '2026-09-26' });
		expect(weekRange('2026-09-24', 'next')).toEqual({ from: '2026-09-28', to: '2026-10-03' });
		// On Sunday, "this week" is the coming one.
		expect(weekRange('2026-09-27', 'this')).toEqual({ from: '2026-09-27', to: '2026-10-03' });
	});

	it('counts an offer that runs on any day of the week', () => {
		const next = weekRange('2026-09-24', 'next');
		expect(runsDuring({ validFrom: '2026-09-28', validUntil: '2026-10-03' }, next)).toBe(true);
		expect(runsDuring({ validFrom: '2026-09-21', validUntil: '2026-09-26' }, next)).toBe(false);
		expect(runsDuring({ validFrom: null, validUntil: '2026-09-30' }, next)).toBe(true);
		expect(
			runsDuring(
				{ validFrom: '2026-10-01', validUntil: '2026-10-03' },
				weekRange('2026-09-24', 'this')
			)
		).toBe(false);
	});
});

describe('offerLink', () => {
	it('leads every offer somewhere useful', () => {
		expect(offerLink({ store: 'lidl', source: 'marktguru', brand: 'Galbani', url: null })).toEqual({
			href: 'https://www.marktguru.de/rb/lidl/galbani',
			label: 'Galbani bei Lidl auf marktguru'
		});
		// Old cached offers point at marktguru's home page: build the link instead.
		expect(
			offerLink({ store: 'rewe', source: 'marktguru', url: 'https://www.marktguru.de/' }).href
		).toBe('https://www.marktguru.de/r/rewe');
		expect(
			offerLink({ store: 'rewe', source: 'manual', url: 'https://www.rewe.de/angebote/' })
		).toEqual({ href: 'https://www.rewe.de/angebote/', label: 'Prospekt öffnen' });
		expect(offerLink({ store: 'edeka', source: 'manual', url: null })).toEqual({
			href: 'https://www.marktguru.de/r/edeka',
			label: 'Edeka-Angebote auf marktguru'
		});
	});

	it('writes names like marktguru', () => {
		expect(slug('Gut&Günstig')).toBe('gut-guenstig');
		expect(slug('ja!')).toBe('ja');
		expect(slug('Müller')).toBe('mueller');
	});
});
