import { describe, expect, it } from 'vitest';
import type { Offer } from './offers';
import { estimate, packs, pricesFor, type KnownPrice } from './prices';

const offer = (store: string, product: string, price: number): Offer => ({
	store,
	product,
	price,
	oldPrice: null,
	validUntil: '2026-09-26',
	source: 'manual'
});

const shelf = (store: string, key: string, product: string, price: number): KnownPrice => ({
	id: `${store}-${product}`,
	key,
	store,
	product,
	price,
	seenOn: '2026-09-20',
	createdBy: 'anna'
});

describe('packs', () => {
	it('counts pieces but not amounts', () => {
		expect(packs('3')).toBe(3);
		expect(packs('2x')).toBe(2);
		expect(packs('2 Stück')).toBe(2);
		expect(packs('4 Dosen')).toBe(4);
		expect(packs('2 l')).toBe(1);
		expect(packs('500 g')).toBe(1);
		expect(packs('')).toBe(1);
		expect(packs(null)).toBe(1);
		expect(packs('0')).toBe(1);
	});
});

describe('pricesFor', () => {
	it('finds prices stored for the entry or naming the product exactly', () => {
		const known = [
			shelf('edeka', 'mozzarella', 'Gut&Günstig Mozzarella', 79),
			shelf('rewe', 'kaese', 'Galbani Mozzarella', 129),
			shelf('rewe', 'milch', 'Frische Milch', 119)
		];
		expect(pricesFor('Mozzarella', known).map((k) => k.product)).toEqual([
			'Gut&Günstig Mozzarella',
			'Galbani Mozzarella'
		]);
	});
});

describe('estimate', () => {
	const items = [
		{ id: 'mo', name: 'Mozzarella', quantity: '2' },
		{ id: 'mi', name: 'Milch', quantity: '1 l' },
		{ id: 'br', name: 'Brot', quantity: null }
	];

	it('takes the cheapest of offer and known price, times the packs', () => {
		const r = estimate(
			items,
			{ mo: [offer('rewe', 'Galbani Mozzarella', 99)], mi: [offer('lidl', 'Milbona Milch', 95)] },
			[
				shelf('edeka', 'mozzarella', 'Gut&Günstig Mozzarella', 79),
				shelf('rewe', 'milch', 'Frische Milch', 119)
			],
			[]
		);
		expect(r.perItem.mo).toMatchObject({ price: 79, store: 'edeka', packs: 2, from: 'known' });
		expect(r.perItem.mo.cheaper?.product).toBe('Gut&Günstig Mozzarella');
		expect(r.perItem.mi).toMatchObject({ price: 95, from: 'offer', cheaper: null });
		expect(r.perItem.br).toBeUndefined();
		expect(r).toMatchObject({ total: 79 * 2 + 95, priced: 2 });
	});

	it('only counts the family’s stores once it has chosen some', () => {
		const r = estimate(
			items,
			{ mo: [offer('rewe', 'Galbani Mozzarella', 99)] },
			[shelf('edeka', 'mozzarella', 'Gut&Günstig Mozzarella', 79)],
			['rewe']
		);
		expect(r.perItem.mo).toMatchObject({ price: 99, from: 'offer', cheaper: null });
	});
});
