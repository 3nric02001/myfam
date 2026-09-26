// Calendar dates are plain 'YYYY-MM-DD' strings in German local time. Date objects are only
// used in UTC for arithmetic, so daylight saving time never shifts a day.

const TIME_ZONE = 'Europe/Berlin';

export function today(now = new Date()) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

function parse(date: string) {
	return new Date(`${date}T00:00:00Z`);
}

function iso(date: Date) {
	return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
	return iso(new Date(parse(date).getTime() + days * 86_400_000));
}

/** 'YYYY-MM' of the month `offset` months after the given one. */
export function addMonths(month: string, offset: number) {
	const [y, m] = month.split('-').map(Number);
	const d = new Date(Date.UTC(y, m - 1 + offset, 1));
	return iso(d).slice(0, 7);
}

export function isMonth(value: string) {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The Monday-to-Sunday weeks covering a month, as a flat list of dates. */
export function monthGrid(month: string) {
	const first = `${month}-01`;
	const weekday = (parse(first).getUTCDay() + 6) % 7; // Monday = 0
	const start = addDays(first, -weekday);
	const last = addDays(`${addMonths(month, 1)}-01`, -1);
	const days: string[] = [];
	for (let d = start; d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
	return days;
}

export function monthLabel(month: string) {
	return new Intl.DateTimeFormat('de-DE', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(parse(`${month}-01`));
}

export function dayLabel(date: string) {
	return new Intl.DateTimeFormat('de-DE', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	}).format(parse(date));
}

/** "Sa., 3.10.": short enough for one line on a phone. */
export function shortDayLabel(date: string) {
	return new Intl.DateTimeFormat('de-DE', {
		weekday: 'short',
		day: 'numeric',
		month: 'numeric',
		timeZone: 'UTC'
	}).format(parse(date));
}

export function shortDate(date: string) {
	return new Intl.DateTimeFormat('de-DE', {
		day: 'numeric',
		month: 'numeric',
		timeZone: 'UTC'
	}).format(parse(date));
}

/** The Monday of the week the date is in. */
export function weekStart(date: string) {
	return addDays(date, -((parse(date).getUTCDay() + 6) % 7));
}
