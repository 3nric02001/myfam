// Shopping history from saved receipts: what one line costs and spending per week or month.
// Pure functions, shared by the server and the history page.

import { addDays, addMonths, shortDate, weekStart } from './dates';

export type PurchaseLine = {
	name: string;
	product: string;
	/** Price of one pack in cents. */
	price: number;
	count: number;
	weighed: boolean;
};

export type PurchaseSummary = {
	id: string;
	store: string;
	date: string;
	total: number;
	lines: number;
	createdBy: string | null;
};

export type Period = 'week' | 'month';

/** How many weeks or months the history chart shows: what fits side by side on a phone. */
export const CHART_PERIODS = { week: 8, month: 6 } as const;

export type Bucket = {
	/** First day of the week ('YYYY-MM-DD') or the month ('YYYY-MM'). */
	key: string;
	label: string;
	total: number;
	trips: number;
};

/** What a line cost in cents: weighed goods are printed with their final price. */
export function lineTotal(line: Pick<PurchaseLine, 'price' | 'count' | 'weighed'>) {
	return line.weighed ? line.price : line.price * Math.max(1, line.count);
}

export function purchaseTotal(lines: Pick<PurchaseLine, 'price' | 'count' | 'weighed'>[]) {
	return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

/** "GUT&GUENSTIG MOZZ. · 2 × 0,79 €": what the receipt said, when it adds to the name. */
export function lineDetails(line: PurchaseLine, price: (cents: number) => string) {
	const parts: string[] = [];
	if (line.product.toLowerCase() !== line.name.toLowerCase()) parts.push(line.product);
	if (line.weighed) parts.push('nach Gewicht');
	else if (line.count > 1) parts.push(`${line.count} × ${price(line.price)}`);
	return parts.join(' · ');
}

// Fixed, because browsers and Node disagree on "Sep" or "Sept.".
const MONTH_SHORT = [
	'Jan',
	'Feb',
	'Mär',
	'Apr',
	'Mai',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Okt',
	'Nov',
	'Dez'
];

function monthShort(month: string) {
	return MONTH_SHORT[Number(month.slice(5, 7)) - 1];
}

/** The keys of the last `count` weeks or months up to and including the one `today` is in. */
export function periodKeys(period: Period, today: string, count: number) {
	const keys: string[] = [];
	if (period === 'week') {
		const current = weekStart(today);
		for (let i = count - 1; i >= 0; i--) keys.push(addDays(current, -7 * i));
	} else {
		const current = today.slice(0, 7);
		for (let i = count - 1; i >= 0; i--) keys.push(addMonths(current, -i));
	}
	return keys;
}

/** The first day that `periodKeys` covers, to load only what the chart needs. */
export function periodStart(period: Period, today: string, count: number) {
	const first = periodKeys(period, today, count)[0];
	return period === 'week' ? first : `${first}-01`;
}

export function periodKey(period: Period, date: string) {
	return period === 'week' ? weekStart(date) : date.slice(0, 7);
}

export function bucketLabel(period: Period, key: string) {
	return period === 'week' ? shortDate(key) : monthShort(key);
}

/** Spending per week or month, oldest first; periods without a trip are 0. */
export function spendingBy(
	period: Period,
	purchases: { date: string; total: number }[],
	today: string,
	count: number
): Bucket[] {
	const buckets = new Map<string, Bucket>(
		periodKeys(period, today, count).map((key) => [
			key,
			{ key, label: bucketLabel(period, key), total: 0, trips: 0 }
		])
	);
	for (const p of purchases) {
		const bucket = buckets.get(periodKey(period, p.date));
		if (!bucket) continue;
		bucket.total += p.total;
		bucket.trips++;
	}
	return [...buckets.values()];
}

/** Average of the periods before the current one that have a trip, or null if none. */
export function averageSpending(buckets: Bucket[]) {
	const past = buckets.slice(0, -1).filter((b) => b.trips);
	if (!past.length) return null;
	return Math.round(past.reduce((s, b) => s + b.total, 0) / past.length);
}

/** Groups purchases (newest first) by month for the list, keeping their order. */
export function groupByMonth<T extends { date: string }>(purchases: T[]) {
	const groups: { month: string; items: T[] }[] = [];
	for (const p of purchases) {
		const month = p.date.slice(0, 7);
		if (groups.at(-1)?.month !== month) groups.push({ month, items: [] });
		groups.at(-1)!.items.push(p);
	}
	return groups;
}
