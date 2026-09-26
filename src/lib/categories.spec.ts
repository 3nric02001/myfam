import { describe, expect, it } from 'vitest';
import { categoryKey, guessCategory } from './categories';

describe('guessCategory', () => {
	it.each([
		['Bananen', 'obst-gemuese'],
		['Kirschtomaten', 'obst-gemuese'],
		['Rote Bete', 'obst-gemuese'],
		['Äpfel', 'obst-gemuese'],
		['Brötchen', 'brot'],
		['Milch', 'kuehlregal'],
		['H-Milch 1,5%', 'kuehlregal'],
		['Frischkäse', 'kuehlregal'],
		['Crème fraîche', 'kuehlregal'],
		['Eier', 'kuehlregal'],
		['Hähnchenbrust', 'fleisch-fisch'],
		['Leberwurst', 'fleisch-fisch'],
		['Milchreis', 'vorrat'],
		['Spaghetti', 'vorrat'],
		['Kaffee', 'vorrat'],
		['Vollmilchschokolade', 'suesses'],
		['Apfelsaft', 'getraenke'],
		['Eistee', 'getraenke'],
		['TK Erbsen', 'tiefkuehl'],
		['Pizza', 'tiefkuehl'],
		['Zahnpasta', 'drogerie'],
		['Sonnencreme', 'drogerie'],
		['Klopapier', 'drogerie'],
		['Spülmittel', 'haushalt'],
		['Müllbeutel', 'haushalt'],
		['Windeln', 'baby-tier'],
		['Katzenfutter', 'baby-tier'],
		['Geschenkpapier', 'sonstiges'],
		['', 'sonstiges']
	])('%s → %s', (name, category) => {
		expect(guessCategory(name)).toBe(category);
	});
});

describe('categoryKey', () => {
	it('ignores case, spacing, punctuation and amounts', () => {
		expect(categoryKey(' Äpfel ')).toBe(categoryKey('äpfel'));
		expect(categoryKey('H-Milch 2')).toBe('h milch');
	});
});
