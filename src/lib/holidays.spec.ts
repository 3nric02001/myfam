import { describe, expect, it } from 'vitest';
import { easterSunday, holidaysBetween, holidaysOfYear } from './holidays';

const names = (list: { name: string }[]) => list.map((h) => h.name);

describe('holidays', () => {
	it('computes Easter Sunday', () => {
		const easter = (y: number) => easterSunday(y).toISOString().slice(0, 10);
		expect(easter(2024)).toBe('2024-03-31');
		expect(easter(2025)).toBe('2025-04-20');
		expect(easter(2026)).toBe('2026-04-05');
		expect(easter(2027)).toBe('2027-03-28');
		expect(easter(2038)).toBe('2038-04-25');
	});

	it('lists the nine nationwide holidays without a Bundesland', () => {
		expect(holidaysOfYear(2026)).toEqual([
			{ date: '2026-01-01', name: 'Neujahr' },
			{ date: '2026-04-03', name: 'Karfreitag' },
			{ date: '2026-04-06', name: 'Ostermontag' },
			{ date: '2026-05-01', name: 'Tag der Arbeit' },
			{ date: '2026-05-14', name: 'Christi Himmelfahrt' },
			{ date: '2026-05-25', name: 'Pfingstmontag' },
			{ date: '2026-10-03', name: 'Tag der Deutschen Einheit' },
			{ date: '2026-12-25', name: '1. Weihnachtstag' },
			{ date: '2026-12-26', name: '2. Weihnachtstag' }
		]);
	});

	it('adds regional holidays for the chosen Bundesland', () => {
		expect(holidaysOfYear(2026, 'BY').length).toBe(12);
		expect(names(holidaysOfYear(2026, 'BY'))).toContain('Fronleichnam');
		expect(holidaysOfYear(2026, 'BY').find((h) => h.name === 'Fronleichnam')?.date).toBe(
			'2026-06-04'
		);
		expect(names(holidaysOfYear(2026, 'BE'))).toContain('Internationaler Frauentag');
		expect(names(holidaysOfYear(2026, 'NI'))).toContain('Reformationstag');
		expect(names(holidaysOfYear(2026, 'NI'))).not.toContain('Allerheiligen');
		expect(names(holidaysOfYear(2026, 'TH'))).toContain('Weltkindertag');
		expect(holidaysOfYear(2026, 'BB').map((h) => h.date)).toContain('2026-04-05');
	});

	it('finds Buß- und Bettag on the Wednesday before 23 November', () => {
		const bettag = (y: number) =>
			holidaysOfYear(y, 'SN').find((h) => h.name === 'Buß- und Bettag')?.date;
		expect(bettag(2024)).toBe('2024-11-20');
		expect(bettag(2025)).toBe('2025-11-19');
		expect(bettag(2026)).toBe('2026-11-18');
		// 22 November 2028 is itself a Wednesday.
		expect(bettag(2028)).toBe('2028-11-22');
	});

	it('returns holidays within a range across years', () => {
		expect(names(holidaysBetween('2026-12-20', '2027-01-10'))).toEqual([
			'1. Weihnachtstag',
			'2. Weihnachtstag',
			'Neujahr'
		]);
	});
});
