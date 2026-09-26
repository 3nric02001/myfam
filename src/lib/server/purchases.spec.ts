import { describe, expect, it } from 'vitest';
import { deletePurchase, getPurchase, listPurchases, savePurchase } from './purchases';
import { seedFamily, testDb } from './test/setup';

describe('purchases', () => {
	it('saves a trip with its lines, per family', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		const lines = [
			{ name: 'Milch', product: 'H-MILCH 3,5%', price: 119, count: 2, weighed: false },
			{ name: 'Äpfel', product: 'AEPFEL BRAEBURN', price: 312, count: 1, weighed: true }
		];
		const trip = await savePurchase(db, a.family.id, a.owner.id, {
			store: 'rewe',
			date: '2026-09-21',
			lines
		});
		await savePurchase(db, a.family.id, a.owner.id, {
			store: 'aldi-sued',
			date: '2026-09-25',
			lines: [lines[0]]
		});
		expect(
			await savePurchase(db, a.family.id, a.owner.id, {
				store: 'rewe',
				date: '2026-09-25',
				lines: []
			})
		).toBeNull();

		expect(trip?.total).toBe(550);
		const list = await listPurchases(db, a.family.id);
		expect(list.map((p) => [p.store, p.date, p.total, p.lines, p.createdBy])).toEqual([
			['aldi-sued', '2026-09-25', 238, 1, 'anna'],
			['rewe', '2026-09-21', 550, 2, 'anna']
		]);
		expect(await listPurchases(db, a.family.id, { from: '2026-09-22' })).toHaveLength(1);
		expect(await listPurchases(db, b.family.id)).toEqual([]);

		const full = await getPurchase(db, a.family.id, trip!.id);
		expect(full?.lines.map((l) => [l.name, l.count, l.weighed])).toEqual([
			['Milch', 2, false],
			['Äpfel', 1, true]
		]);
		expect(await getPurchase(db, b.family.id, trip!.id)).toBeNull();

		await deletePurchase(db, b.family.id, trip!.id);
		expect(await listPurchases(db, a.family.id)).toHaveLength(2);
		await deletePurchase(db, a.family.id, trip!.id);
		expect(await listPurchases(db, a.family.id)).toHaveLength(1);
	});
});
