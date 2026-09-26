// Reading a till receipt from its recognized text: store, date and one price per product line.
// Pure functions; the text comes from OCR on the server, so it is often a little garbled.

import { STORES, words } from './offers';

export type ReceiptLine = {
	/** The product as printed, e.g. "GUT&GUENSTIG MOZZ.". */
	text: string;
	/** Price of one pack in cents, after discounts printed below the line. */
	price: number;
	/** How many were bought when the receipt says so ("2 Stk x 0,79"). */
	count: number;
	/** Sold by weight: the price is for the amount bought, not a fixed pack. */
	weighed: boolean;
};

export type Receipt = { store: string | null; date: string | null; lines: ReceiptLine[] };

// "Mozzarella 0,99 B", "H-MILCH 3,5% 1L  1,19 A", "Rabatt -0,20". OCR sometimes reads the comma
// as a dot or puts a blank next to it.
const PRICE_LINE =
	/^(.*?[a-zäöüß].*?)\s+(-?\d{1,3})\s?[,.]\s?(\d{2})(?:\s*[*]?\s*[a-d0-9]{0,2}\s*[*]?)?$/i;
const COUNT_LINE = /^(\d{1,2})\s*(?:stk\.?|st\.?|x)\s*x?\s*(\d{1,3})\s?[,.]\s?(\d{2})\b/i;
const WEIGHT_LINE = /\d\s?[,.]\s?\d{2,3}\s*kg\b/i;
const END = /^(summe|gesamt|total|zu zahlen|zwischensumme)\b/i;
const NOT_A_PRODUCT =
	/^(pfand|leergut|mwst|steuer|netto|brutto|geg|gegeben|rückgeld|rueckgeld|ec|bar|kartenzahlung|visa|mastercard|payback|coupon|bon|posten|artikel|eur)\b/i;
const DISCOUNT = /^(rabatt|preisvorteil|nachlass|aktion|sofortrabatt|coupon|abzug)\b/i;

// How store names are printed at the top of a receipt.
const STORE_NAMES: [RegExp, string][] = [
	[/\baldi\s*s(ü|ue|u)d\b/i, 'aldi-sued'],
	[/\baldi\b/i, 'aldi-nord'],
	[/\bnetto\b/i, 'netto-marken-discount'],
	[/\bmarktkauf\b/i, 'marktkauf'],
	[/\bdm[\s-]?drogerie|\bdm\b/i, 'dm'],
	...STORES.filter(
		(s) => !['aldi-nord', 'aldi-sued', 'netto-marken-discount', 'dm'].includes(s.id)
	).map((s): [RegExp, string] => [new RegExp(`\\b${s.label}\\b`, 'i'), s.id])
];

function cents(euros: string, hundredths: string) {
	const value = Math.abs(Number(euros)) * 100 + Number(hundredths);
	return euros.startsWith('-') ? -value : value;
}

function findDate(text: string) {
	const m = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/);
	if (!m) return null;
	const year = m[3].length === 2 ? `20${m[3]}` : m[3];
	const date = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
	return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
}

export function parseReceipt(text: string): Receipt {
	const rows = text
		.split('\n')
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
	const head = rows.slice(0, 8).join(' ');
	const store = STORE_NAMES.find(([re]) => re.test(head))?.[1] ?? null;
	const lines: ReceiptLine[] = [];

	for (const row of rows) {
		if (END.test(row)) break;
		const last = lines.at(-1);
		const count = row.match(COUNT_LINE);
		if (count && last) {
			last.count = Number(count[1]);
			last.price = cents(count[2], count[3]);
			continue;
		}
		if (WEIGHT_LINE.test(row) && !PRICE_LINE.test(row.replace(/kg.*$/i, ''))) {
			if (last) last.weighed = true;
			continue;
		}
		const m = row.match(PRICE_LINE);
		if (!m) continue;
		const name = m[1].trim();
		const price = cents(m[2], m[3]);
		if (price < 0 || DISCOUNT.test(name)) {
			// A discount belongs to the product above it.
			if (last) last.price = Math.max(0, last.price - Math.abs(price) / last.count);
			continue;
		}
		if (NOT_A_PRODUCT.test(name) || words(name).every((w) => /^\d+$/.test(w))) continue;
		if (price === 0) continue;
		lines.push({ text: name, price, count: 1, weighed: false });
	}
	for (const l of lines) l.price = Math.round(l.price);
	return { store, date: findDate(text), lines };
}

/** "GUT&GUENSTIG MOZZ." -> "Gut&Guenstig Mozz.": easier to read than capitals. */
export function tidy(text: string) {
	return text
		.toLowerCase()
		.replace(
			/(^|[\s&\-/(])([a-zäöüß])/g,
			(_, before: string, c: string) => before + c.toUpperCase()
		);
}

/**
 * Whether a receipt line is the list entry. Receipts shorten words ("MOZZ." for Mozzarella), so
 * a word of three letters or more also counts when it starts the entry's word.
 */
export function lineMatches(entry: string, line: string) {
	const wanted = words(entry).filter((w) => w.length >= 3 && !/\d/.test(w));
	if (!wanted.length) return false;
	const have = words(line).filter((w) => w.length >= 3);
	return wanted.every((w) =>
		have.some((h) => h === w || w.startsWith(h) || h.startsWith(w) || h.endsWith(w))
	);
}

/** The list entry or earlier purchase a receipt line most likely is, preferring the longest name. */
export function guessEntry(line: string, names: string[]) {
	return (
		names
			.filter((n) => lineMatches(n, line))
			.sort((a, b) => words(b).join('').length - words(a).join('').length)[0] ?? null
	);
}
