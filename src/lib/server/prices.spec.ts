import { describe, expect, it } from 'vitest';
import { deleteKnownPrice, listKnownPrices, recordPrice } from './prices';
import { seedFamily, testDb } from './test/setup';

describe('known prices', () => {
	it('keeps the newest price per entry, store and product, per family', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		const base = { name: 'Mozzarella', store: 'edeka', seenOn: '2026-09-20' };
		await recordPrice(db, a.family.id, a.owner.id, {
			...base,
			product: 'Gut&Günstig Mozzarella',
			price: 79
		});
		await recordPrice(db, a.family.id, a.owner.id, {
			...base,
			product: 'gut&günstig mozzarella',
			price: 85
		});
		await recordPrice(db, a.family.id, a.owner.id, { ...base, store: 'rewe', price: 129 });

		const list = await listKnownPrices(db, a.family.id);
		expect(list.map((k) => [k.store, k.product, k.price, k.createdBy])).toEqual([
			['edeka', 'gut&günstig mozzarella', 85, 'anna'],
			['rewe', 'Mozzarella', 129, 'anna']
		]);
		expect(list.every((k) => k.key === 'mozzarella')).toBe(true);
		expect(await listKnownPrices(db, b.family.id)).toEqual([]);

		await deleteKnownPrice(db, b.family.id, list[0].id);
		expect(await listKnownPrices(db, a.family.id)).toHaveLength(2);
		await deleteKnownPrice(db, a.family.id, list[0].id);
		expect(await listKnownPrices(db, a.family.id)).toHaveLength(1);
	});
});
