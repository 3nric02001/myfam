import { describe, expect, it } from 'vitest';
import {
	averageSpending,
	groupByMonth,
	lineDetails,
	lineTotal,
	periodStart,
	purchaseTotal,
	spendingBy
} from './purchases';

const line = { name: 'Mozzarella', product: 'Mozzarella', price: 79, count: 1, weighed: false };

describe('purchase lines', () => {
	it('multiplies packs but not weighed goods', () => {
		expect(lineTotal({ ...line, count: 3 })).toBe(237);
		expect(lineTotal({ ...line, price: 412, count: 3, weighed: true })).toBe(412);
		expect(purchaseTotal([line, { ...line, count: 2 }])).toBe(237);
	});

	it('shows what the receipt said only when it adds something', () => {
		const euro = (c: number) => `${c / 100} €`;
		expect(lineDetails(line, euro)).toBe('');
		expect(lineDetails({ ...line, product: 'GUT&GUENSTIG MOZZ.', count: 2 }, euro)).toBe(
			'GUT&GUENSTIG MOZZ. · 2 × 0.79 €'
		);
		expect(lineDetails({ ...line, weighed: true }, euro)).toBe('nach Gewicht');
	});
});

describe('spending per period', () => {
	const trips = [
		{ date: '2026-09-26', total: 5000 },
		{ date: '2026-09-21', total: 1000 },
		{ date: '2026-09-14', total: 3000 },
		{ date: '2026-08-31', total: 2000 },
		{ date: '2026-03-01', total: 9900 }
	];

	it('sums weeks from Monday and leaves empty weeks at 0', () => {
		const weeks = spendingBy('week', trips, '2026-09-26', 4);
		expect(weeks.map((w) => [w.key, w.total, w.trips])).toEqual([
			['2026-08-31', 2000, 1],
			['2026-09-07', 0, 0],
			['2026-09-14', 3000, 1],
			['2026-09-21', 6000, 2]
		]);
		expect(weeks[3].label).toBe('21.9.');
		expect(averageSpending(weeks)).toBe(2500);
	});

	it('sums months and skips older trips', () => {
		const months = spendingBy('month', trips, '2026-09-26', 3);
		expect(months.map((m) => [m.key, m.total, m.label])).toEqual([
			['2026-07', 0, 'Jul'],
			['2026-08', 2000, 'Aug'],
			['2026-09', 9000, 'Sep']
		]);
		expect(periodStart('month', '2026-09-26', 3)).toBe('2026-07-01');
		expect(periodStart('week', '2026-09-26', 2)).toBe('2026-09-14');
	});

	it('has no average without earlier trips', () => {
		expect(averageSpending(spendingBy('week', [trips[0]], '2026-09-26', 4))).toBeNull();
	});

	it('groups the list by month in order', () => {
		expect(groupByMonth(trips).map((g) => [g.month, g.items.length])).toEqual([
			['2026-09', 3],
			['2026-08', 1],
			['2026-03', 1]
		]);
	});
});
