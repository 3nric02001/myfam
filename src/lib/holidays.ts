// German public holidays, computed offline. Nationwide holidays always apply; regional ones only
// when the family has picked its Bundesland. Holidays that only apply in parts of a state
// (e.g. Mariä Himmelfahrt in Bavaria, Fronleichnam in parts of Saxony) are left out.

export const STATES = {
	BW: 'Baden-Württemberg',
	BY: 'Bayern',
	BE: 'Berlin',
	BB: 'Brandenburg',
	HB: 'Bremen',
	HH: 'Hamburg',
	HE: 'Hessen',
	MV: 'Mecklenburg-Vorpommern',
	NI: 'Niedersachsen',
	NW: 'Nordrhein-Westfalen',
	RP: 'Rheinland-Pfalz',
	SL: 'Saarland',
	SN: 'Sachsen',
	ST: 'Sachsen-Anhalt',
	SH: 'Schleswig-Holstein',
	TH: 'Thüringen'
} as const;

export type State = keyof typeof STATES;

export function isState(value: unknown): value is State {
	return typeof value === 'string' && Object.hasOwn(STATES, value);
}

export type Holiday = { date: string; name: string };

/** Easter Sunday (Gregorian calendar), using the anonymous Gregorian algorithm. */
export function easterSunday(year: number): Date {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(Date.UTC(year, month - 1, day));
}

function iso(date: Date) {
	return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, days: number) {
	return new Date(date.getTime() + days * 86_400_000);
}

export function holidaysOfYear(year: number, state: State | null = null): Holiday[] {
	const easter = easterSunday(year);
	const fixed = (month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
	const is = (...states: State[]) => state !== null && states.includes(state);
	const list: [Date, string, boolean][] = [
		[fixed(1, 1), 'Neujahr', true],
		[fixed(1, 6), 'Heilige Drei Könige', is('BW', 'BY', 'ST')],
		[
			fixed(3, 8),
			'Internationaler Frauentag',
			(is('BE') && year >= 2019) || (is('MV') && year >= 2023)
		],
		[plusDays(easter, -2), 'Karfreitag', true],
		[easter, 'Ostersonntag', is('BB')],
		[plusDays(easter, 1), 'Ostermontag', true],
		[fixed(5, 1), 'Tag der Arbeit', true],
		[plusDays(easter, 39), 'Christi Himmelfahrt', true],
		[plusDays(easter, 49), 'Pfingstsonntag', is('BB')],
		[plusDays(easter, 50), 'Pfingstmontag', true],
		[plusDays(easter, 60), 'Fronleichnam', is('BW', 'BY', 'HE', 'NW', 'RP', 'SL')],
		[fixed(8, 15), 'Mariä Himmelfahrt', is('SL')],
		[fixed(9, 20), 'Weltkindertag', is('TH') && year >= 2019],
		[fixed(10, 3), 'Tag der Deutschen Einheit', true],
		[
			fixed(10, 31),
			'Reformationstag',
			is('BB', 'MV', 'SN', 'ST', 'TH') || (is('HB', 'HH', 'NI', 'SH') && year >= 2018)
		],
		[fixed(11, 1), 'Allerheiligen', is('BW', 'BY', 'NW', 'RP', 'SL')],
		// Buß- und Bettag is the Wednesday before 23 November.
		[plusDays(fixed(11, 22), -((fixed(11, 22).getUTCDay() + 4) % 7)), 'Buß- und Bettag', is('SN')],
		[fixed(12, 25), '1. Weihnachtstag', true],
		[fixed(12, 26), '2. Weihnachtstag', true]
	];
	return list
		.filter(([, , applies]) => applies)
		.map(([date, name]) => ({ date: iso(date), name }))
		.sort((a, b) => a.date.localeCompare(b.date));
}

/** Holidays between two 'YYYY-MM-DD' dates, inclusive. */
export function holidaysBetween(from: string, to: string, state: State | null = null): Holiday[] {
	const result: Holiday[] = [];
	for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
		for (const h of holidaysOfYear(year, state)) {
			if (h.date >= from && h.date <= to) result.push(h);
		}
	}
	return result;
}
