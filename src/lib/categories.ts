// Sorting shopping list entries into supermarket sections, by keywords. Works offline and
// guesses; the family can correct a guess, and the correction wins from then on.

import { words } from './offers';

/** Sections in the order you usually walk through a supermarket. */
export const CATEGORIES = [
	{ id: 'obst-gemuese', label: 'Obst & Gemüse' },
	{ id: 'brot', label: 'Brot & Backwaren' },
	{ id: 'kuehlregal', label: 'Milch, Käse & Eier' },
	{ id: 'fleisch-fisch', label: 'Fleisch, Wurst & Fisch' },
	{ id: 'vorrat', label: 'Vorrat & Konserven' },
	{ id: 'suesses', label: 'Süßes & Snacks' },
	{ id: 'getraenke', label: 'Getränke' },
	{ id: 'tiefkuehl', label: 'Tiefkühl' },
	{ id: 'drogerie', label: 'Drogerie & Hygiene' },
	{ id: 'haushalt', label: 'Haushalt' },
	{ id: 'baby-tier', label: 'Baby & Tier' },
	{ id: 'sonstiges', label: 'Sonstiges' }
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function isCategory(id: string): id is CategoryId {
	return CATEGORIES.some((c) => c.id === id);
}

/** The sections in the family's own order; sections missing from it follow in the usual order. */
export function orderedCategories(order: readonly string[] | null | undefined) {
	const placed = [...new Set((order ?? []).filter(isCategory))];
	return [
		...placed.map((id) => CATEGORIES.find((c) => c.id === id)!),
		...CATEGORIES.filter((c) => !placed.includes(c.id))
	];
}

export function categoryLabel(id: string) {
	return CATEGORIES.find((c) => c.id === id)?.label ?? 'Sonstiges';
}

// Keywords are written as words() returns them: lowercase, umlauts spelled out.
// Words of four letters or more also match at the end of a compound ("Kirschtomaten").
const KEYWORDS: Record<Exclude<CategoryId, 'sonstiges'>, string> = {
	'obst-gemuese': `
		obst gemuese salat apfel aepfel birne birnen banane bananen orange orangen mandarine
		mandarinen clementine clementinen zitrone zitronen limette limetten traube trauben beere
		beeren erdbeere erdbeeren himbeere himbeeren heidelbeere heidelbeeren kirsche kirschen
		pfirsich pfirsiche nektarine nektarinen pflaume pflaumen melone melonen ananas mango kiwi
		avocado tomate tomaten gurke gurken paprika zucchini aubergine karotte karotten moehre
		moehren moehrchen kartoffel kartoffeln zwiebel zwiebeln knoblauch lauch porree sellerie
		brokkoli broccoli blumenkohl kohl kohlrabi spinat rucola feldsalat radieschen rettich
		kuerbis pilze champignons mais spargel fenchel ingwer petersilie schnittlauch basilikum
		dill kraeuter minze koriander bohnen erbsen rotebete suppengruen`,
	brot: `
		brot brote broetchen semmel semmeln baguette toast toastbrot croissant croissants brezel
		brezeln laugenstange kuchen torte zwieback knaeckebrot fladenbrot wraps tortilla tortillas
		hefezopf berliner`,
	kuehlregal: `
		milch vollmilch hmilch buttermilch sahne schlagsahne schmand cremefraiche butter
		margarine joghurt jogurt quark skyr kefir kaese gouda emmentaler mozzarella feta parmesan
		frischkaese camembert brie ei eier pudding tofu hefe`,
	'fleisch-fisch': `
		fleisch hackfleisch hack gehacktes rind rindfleisch schwein schweinefleisch haehnchen
		huehnchen haehnchenbrust huhn pute putenbrust steak schnitzel wurst wuerstchen
		bratwurst salami schinken speck aufschnitt leberwurst mortadella lachs thunfisch fisch
		forelle garnelen shrimps hering`,
	vorrat: `
		nudeln spaghetti penne fusilli lasagne reis mehl zucker salz pfeffer gewuerz gewuerze
		oel olivenoel rapsoel sonnenblumenoel essig senf ketchup mayonnaise mayo sosse sauce bruehe bruehwuerfel
		tomatenmark passata dose dosen konserve konserven linsen kichererbsen haferflocken muesli
		cornflakes marmelade konfituere honig nutella nussnougatcreme erdnussbutter backpulver
		vanillezucker kakao kaffee tee espresso nuesse mandeln rosinen couscous bulgur quinoa
		suppe ravioli`,
	suesses: `
		schokolade schoko chips flips kekse keks gummibaerchen bonbons bonbon suessigkeiten
		riegel praline pralinen popcorn salzstangen cracker waffeln lakritz`,
	getraenke: `
		wasser mineralwasser sprudel saft apfelsaft orangensaft schorle limo limonade cola fanta
		sprite eistee bier wein sekt prosecco getraenk getraenke energydrink smoothie`,
	tiefkuehl: `
		tiefkuehl tk pizza eis speiseeis eiscreme pommes fischstaebchen tiefkuehlgemuese
		rahmspinat kroketten`,
	drogerie: `
		zahnpasta zahnbuerste zahnseide shampoo spuelung duschgel seife handseife deo deodorant
		creme sonnencreme bodylotion lotion rasierer rasierschaum toilettenpapier klopapier
		taschentuecher wattepads wattestaebchen tampons binden pflaster tabletten vitamine
		haarspray makeup abschminktuecher kondome`,
	haushalt: `
		spuelmittel spueltabs geschirrspueltabs waschmittel weichspueler reiniger allzweckreiniger
		glasreiniger wc badreiniger entkalker schwamm schwaemme lappen muellbeutel muelltueten
		kuechenrolle kuechenpapier alufolie frischhaltefolie backpapier gefrierbeutel batterien
		gluehbirne kerzen servietten streichhoelzer feuerzeug`,
	'baby-tier': `
		windeln feuchttuecher babynahrung babybrei milchpulver schnuller katzenfutter
		hundefutter katzenstreu tierfutter leckerli`
};

const INDEX = new Map<string, CategoryId>();
for (const [category, list] of Object.entries(KEYWORDS)) {
	for (const k of list.split(/\s+/).filter(Boolean)) INDEX.set(k, category as CategoryId);
}
const LONG = [...INDEX.keys()].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length);

/** words() after dropping accents, so "Crème fraîche" reads as "creme fraiche". */
function plainWords(name: string) {
	const plain = name
		.normalize('NFD')
		.replace(/([aouAOU])\u0308/g, '$1e')
		.replace(/[\u0300-\u036f]/g, '');
	return words(plain).filter((w) => !/^\d+$/.test(w));
}

function stem(word: string) {
	return word.length > 4 ? word.replace(/(en|n|e|s)$/, '') : word;
}

function lookup(word: string): CategoryId | null {
	const exact = INDEX.get(word);
	if (exact) return exact;
	// The longest keyword the word ends with: "Kirschtomaten" -> tomaten, "Milchreis" -> reis.
	const s = stem(word);
	const k = LONG.find((k) => word.endsWith(k) || s.endsWith(stem(k)));
	return k ? INDEX.get(k)! : null;
}

/**
 * Guesses the section of a list entry. The last word counts most, as in German the thing comes
 * last. "TK" or "Tiefkühl…" in front always means frozen; a two-word keyword like "rote Bete"
 * is tried as one word as well.
 */
export function guessCategory(name: string): CategoryId {
	const ws = plainWords(name);
	if (ws.some((w) => w === 'tk' || w.startsWith('tiefkuehl'))) return 'tiefkuehl';
	const joined = ws.join('');
	if (INDEX.has(joined)) return INDEX.get(joined)!;
	for (let i = ws.length - 1; i >= 0; i--) {
		const found = lookup(ws[i]);
		if (found) return found;
	}
	return 'sonstiges';
}

/** The key a family correction is stored under, the same for "Milch" and "milch ". */
export function categoryKey(name: string) {
	return plainWords(name).join(' ');
}
