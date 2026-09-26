import { describe, expect, it } from 'vitest';
import { guessEntry, lineMatches, parseReceipt, tidy } from './receipt';

// What tesseract read from a photographed REWE receipt.
const REWE = `REWE Markt GmbH
Musterstraße 1, 80331 München
UID Nr.: DE812706034
EUR
GALBANI MOZZARELLA 0,99 B
GUT&GUENSTIG MOZZ. 1,58 B
2 Stk x 0,79
H-MILCH 3,5% 1L 1,19 B
BIO BANANEN 1,79 B
0,892 kg x 1,99 EUR/kg
SPUELMITTEL 1,45 A
Rabatt -0,20
PFAND 0,25 0,25 A
SUMME EUR 6,46
Geg. EC-Cash EUR 6,46
A= 19,0% 1,43 0,27 1,70
26.09.2026 14:32 Bon-Nr.: 4711`;

describe('parseReceipt', () => {
	it('reads store, date and one price per product', () => {
		const r = parseReceipt(REWE);
		expect(r.store).toBe('rewe');
		expect(r.date).toBe('2026-09-26');
		expect(r.lines).toEqual([
			{ text: 'GALBANI MOZZARELLA', price: 99, count: 1, weighed: false },
			{ text: 'GUT&GUENSTIG MOZZ.', price: 79, count: 2, weighed: false },
			{ text: 'H-MILCH 3,5% 1L', price: 119, count: 1, weighed: false },
			{ text: 'BIO BANANEN', price: 179, count: 1, weighed: true },
			{ text: 'SPUELMITTEL', price: 125, count: 1, weighed: false }
		]);
	});

	it('copes with OCR slips and other stores', () => {
		const r = parseReceipt('ALDI SÜD\nMilch 1 l 0. 99 *\nButter 2,29 1\nSumme 3,28\n1.10.26');
		expect(r.store).toBe('aldi-sued');
		expect(r.date).toBe('2026-10-01');
		expect(r.lines.map((l) => [l.text, l.price])).toEqual([
			['Milch 1 l', 99],
			['Butter', 229]
		]);
		expect(parseReceipt('Lidl\nBrot 1,49 A').store).toBe('lidl');
		expect(parseReceipt('Netto Marken-Discount\nBrot 1,49 A').store).toBe('netto-marken-discount');
		expect(parseReceipt('Kiosk\nBrot 1,49').store).toBeNull();
	});
});

describe('matching receipt lines', () => {
	it('accepts shortened words', () => {
		expect(lineMatches('Mozzarella', 'GUT&GUENSTIG MOZZ.')).toBe(true);
		expect(lineMatches('Milch', 'H-MILCH 3,5% 1L')).toBe(true);
		expect(lineMatches('Bananen', 'BIO BANANEN')).toBe(true);
		expect(lineMatches('Milch', 'SPUELMITTEL')).toBe(false);
		expect(lineMatches('Brot', 'BROTAUFSTRICH')).toBe(true);
	});

	it('picks the most specific entry', () => {
		expect(guessEntry('H-MILCH 3,5% 1L', ['Milch', 'H-Milch', 'Brot'])).toBe('H-Milch');
		expect(guessEntry('SPUELMITTEL', ['Milch'])).toBeNull();
	});

	it('tidies capitals', () => {
		expect(tidy('GUT&GUENSTIG MOZZ.')).toBe('Gut&Guenstig Mozz.');
		expect(tidy('H-MILCH 3,5% 1L')).toBe('H-Milch 3,5% 1l');
	});
});
