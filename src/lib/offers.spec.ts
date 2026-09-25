import { describe, expect, it } from 'vitest';
import { fits, parsePrice, recommend, type Offer } from './offers';

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

describe('fits', () => {
	it('matches every word of the item, also inside longer words and across umlauts', () => {
		expect(fits('Milch', 'Weihenstephan H-Milch 1 l')).toBe(true);
		expect(fits('milch', 'Vollmilch')).toBe(true);
		expect(fits('Käse', 'Gouda Kaese am Stück')).toBe(true);
		expect(fits('Butter Kerrygold', 'Kerrygold Original Irische Butter')).toBe(true);
		expect(fits('Butter Kerrygold', 'Meggle Butter')).toBe(false);
		expect(fits('Brot', 'Milch')).toBe(false);
		expect(fits('!', 'Milch')).toBe(false);
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
});
