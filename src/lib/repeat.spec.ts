import { describe, expect, it } from 'vitest';
import { nextDate, nthDate, occurrences } from './repeat';

describe('nthDate', () => {
	it('skips months without the day', () => {
		expect(nthDate('2026-01-31', 'monthly', 1)).toBeNull();
		expect(nthDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
		expect(nthDate('2028-02-29', 'yearly', 1)).toBeNull();
		expect(nthDate('2028-02-29', 'yearly', 4)).toBe('2032-02-29');
	});
});

describe('occurrences', () => {
	it('lists the weekly dates in a month', () => {
		expect(occurrences('2026-09-01', 'weekly', null, 0, '2026-10-01', '2026-10-31')).toEqual([
			'2026-10-06',
			'2026-10-13',
			'2026-10-20',
			'2026-10-27'
		]);
	});
	it('keeps an occurrence that started before the range and is still running', () => {
		expect(occurrences('2026-09-28', 'weekly', null, 3, '2026-10-01', '2026-10-01')).toEqual([
			'2026-09-28'
		]);
	});
	it('stops at the end date and never goes before the start', () => {
		expect(
			occurrences('2026-10-10', 'biweekly', '2026-11-07', 0, '2026-09-01', '2026-12-31')
		).toEqual(['2026-10-10', '2026-10-24', '2026-11-07']);
	});
	it('finds monthly and yearly dates years later', () => {
		expect(occurrences('2020-05-15', 'monthly', null, 0, '2026-10-01', '2026-10-31')).toEqual([
			'2026-10-15'
		]);
		expect(occurrences('1990-10-03', 'yearly', null, 0, '2026-10-01', '2026-10-31')).toEqual([
			'2026-10-03'
		]);
		expect(occurrences('2020-01-01', 'daily', null, 0, '2026-10-01', '2026-10-02')).toEqual([
			'2026-10-01',
			'2026-10-02'
		]);
	});
});

describe('nextDate', () => {
	it('returns the next date after a given day', () => {
		expect(nextDate('2026-09-29', 'biweekly', '2026-10-01')).toBe('2026-10-13');
		expect(nextDate('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-03-31');
	});
});
