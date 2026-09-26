import { addDays } from './dates';
import type { Repeat } from './server/db/schema';

export type { Repeat };

export const REPEATS: { value: Repeat; label: string }[] = [
	{ value: 'daily', label: 'Jeden Tag' },
	{ value: 'weekly', label: 'Jede Woche' },
	{ value: 'biweekly', label: 'Alle zwei Wochen' },
	{ value: 'monthly', label: 'Jeden Monat' },
	{ value: 'yearly', label: 'Jedes Jahr' }
];

export function isRepeat(value: unknown): value is Repeat {
	return REPEATS.some((r) => r.value === value);
}

export function repeatLabel(repeat: Repeat | null | undefined) {
	return REPEATS.find((r) => r.value === repeat)?.label ?? null;
}

/** Days between two 'YYYY-MM-DD' dates. */
export function daysBetween(from: string, to: string) {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The n-th date of a series starting on `start` (n = 0 is the start itself), or null when that
 * month has no such day (a monthly series on the 31st skips shorter months, like other calendars).
 */
export function nthDate(start: string, repeat: Repeat, n: number): string | null {
	switch (repeat) {
		case 'daily':
			return addDays(start, n);
		case 'weekly':
			return addDays(start, 7 * n);
		case 'biweekly':
			return addDays(start, 14 * n);
		case 'monthly':
		case 'yearly': {
			const [y, m, d] = start.split('-').map(Number);
			const months = repeat === 'monthly' ? n : 12 * n;
			const date = new Date(Date.UTC(y, m - 1 + months, d));
			return date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
		}
	}
}

/** The first date of the series after `after`. */
export function nextDate(start: string, repeat: Repeat, after: string) {
	for (let n = 1; n < 5000; n++) {
		const date = nthDate(start, repeat, n);
		if (date && date > after) return date;
	}
	return null;
}

/**
 * Start dates of a series whose occurrences (each `length` days long) overlap from..to.
 * `until` is the last day an occurrence may start on.
 */
export function occurrences(
	start: string,
	repeat: Repeat,
	until: string | null,
	length: number,
	from: string,
	to: string
) {
	const dates: string[] = [];
	// Skip ahead instead of walking years of a daily series one by one.
	const [sy, sm] = start.split('-').map(Number);
	const [fy, fm] = from.split('-').map(Number);
	const months = (fy - sy) * 12 + (fm - sm);
	const skip = {
		daily: daysBetween(start, from) - length,
		weekly: Math.floor((daysBetween(start, from) - length) / 7),
		biweekly: Math.floor((daysBetween(start, from) - length) / 14),
		monthly: months - 1 - Math.ceil(length / 28),
		yearly: Math.floor(months / 12) - 1 - Math.ceil(length / 365)
	}[repeat];
	let n = Math.max(0, skip);
	for (let guard = 0; guard < 2000; n++, guard++) {
		const date = nthDate(start, repeat, n);
		if (!date) continue;
		if (date > to || (until && date > until)) break;
		if (addDays(date, length) >= from) dates.push(date);
	}
	return dates;
}
