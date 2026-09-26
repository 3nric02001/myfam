// Automatic offers from marktguru.de. There is no official API: this uses the same endpoint
// as their website, with the keys the website embeds. Their terms (info.marktguru.de/agb, § 4)
// forbid automated reading, so it is off unless the server operator sets MARKTGURU_ENABLED=true.
// It may stop working at any time; the app then simply shows the offers entered by hand.

import { env } from '$env/dynamic/private';
import { today as dayOf } from '$lib/dates';
import type { Offer } from '$lib/offers';

export const marktguruEnabled = () => env.MARKTGURU_ENABLED === 'true';

type Fetch = typeof fetch;

type RawOffer = {
	price?: number | null;
	oldPrice?: number | null;
	description?: string | null;
	brand?: { name?: string } | null;
	product?: { name?: string } | null;
	advertisers?: { uniqueName?: string }[];
	validityDates?: { from?: string; to?: string }[];
	externalUrl?: string | null;
};

const API = 'https://api.marktguru.de/api/v1';
const KEY_TTL = 24 * 3600_000;

let keys: { apiKey: string; clientKey: string; at: number } | null = null;

async function getKeys(fetchFn: Fetch) {
	if (keys && Date.now() - keys.at < KEY_TTL) return keys;
	const res = await fetchFn('https://www.marktguru.de/', { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`marktguru: ${res.status}`);
	const html = await res.text();
	for (const m of html.matchAll(/<script\s+type="application\/json">(.*?)<\/script>/gs)) {
		try {
			const config = JSON.parse(m[1])?.config;
			if (config?.apiKey && config?.clientKey) {
				keys = { apiKey: config.apiKey, clientKey: config.clientKey, at: Date.now() };
				return keys;
			}
		} catch {
			// Not the config block.
		}
	}
	throw new Error('marktguru: keine Zugangsdaten auf der Webseite gefunden');
}

const cents = (euros: number | null | undefined) =>
	typeof euros === 'number' && euros > 0 ? Math.round(euros * 100) : null;

/** The German calendar day of a timestamp like '2026-09-21T22:00:00Z' (that is the 22nd). */
function berlinDay(timestamp: string | undefined) {
	if (!timestamp) return '';
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? '' : dayOf(date);
}

/** Turns marktguru's offer into ours. Returns one entry per store that has the offer. */
export function toOffers(raw: RawOffer, today: string): Offer[] {
	const dates = raw.validityDates ?? [];
	const validUntil = dates
		.map((d) => berlinDay(d.to))
		.filter(Boolean)
		.sort()
		.at(-1);
	const validFrom =
		dates
			.map((d) => berlinDay(d.from))
			.filter(Boolean)
			.sort()
			.at(0) ?? null;
	if (!validUntil || validUntil < today) return [];
	const name = [raw.brand?.name, raw.product?.name ?? raw.description].filter(Boolean).join(' ');
	if (!name) return [];
	return (raw.advertisers ?? [])
		.map((a) => a.uniqueName)
		.filter((store): store is string => !!store)
		.map((store) => ({
			store,
			product: name,
			price: cents(raw.price),
			oldPrice: cents(raw.oldPrice),
			validFrom,
			validUntil,
			source: 'marktguru' as const,
			url: raw.externalUrl?.startsWith('https://') ? raw.externalUrl : 'https://www.marktguru.de/'
		}));
}

/** Searches the current offers near a postcode. */
export async function searchMarktguru(
	query: string,
	zip: string,
	today: string,
	fetchFn: Fetch = fetch
): Promise<Offer[]> {
	const { apiKey, clientKey } = await getKeys(fetchFn);
	const params = new URLSearchParams({ as: 'web', q: query, zipCode: zip, limit: '100' });
	const res = await fetchFn(`${API}/offers/search?${params}`, {
		headers: { 'x-apikey': apiKey, 'x-clientkey': clientKey },
		signal: AbortSignal.timeout(10_000)
	});
	if (res.status === 401 || res.status === 403) keys = null;
	if (!res.ok) throw new Error(`marktguru: ${res.status}`);
	const data = (await res.json()) as { results?: RawOffer[] };
	return (data.results ?? []).flatMap((o) => toOffers(o, today));
}

/** For tests. */
export function resetKeys() {
	keys = null;
}
