import { env } from '$env/dynamic/private';
import { BlockedAddressError, parseHostList, publicFetch } from './safe-fetch';

// Reads events from a CalDAV calendar (e.g. Nextcloud) or a plain ICS link. Only reads, never
// writes. Error messages are shown to family admins, so they never contain the server's response.

type Fetch = typeof fetch;

/** Only public addresses, plus the hosts the operator allows (CALDAV_ALLOW_HOSTS). */
export const calendarFetch: Fetch = publicFetch({
	allowHosts: () => parseHostList(env.CALDAV_ALLOW_HOSTS)
});

export type Source = { url: string; username?: string | null; password?: string | null };

export class CalendarError extends Error {}

const TIMEOUT = 30_000;
/** Largest response we accept, so a wrong link can't fill the memory. */
const MAX_BYTES = 20 * 1024 * 1024;

/** webcal:// is how calendar apps link subscriptions; it is plain HTTPS underneath. */
export function normalizeUrl(input: string): string | null {
	const trimmed = input.trim().replace(/^webcals?:\/\//i, 'https://');
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		if (url.username || url.password) return null;
		return url.toString();
	} catch {
		return null;
	}
}

function headers(source: Source, extra: Record<string, string> = {}) {
	const result: Record<string, string> = { 'User-Agent': 'MyFam', ...extra };
	if (source.username) {
		const token = Buffer.from(`${source.username}:${source.password ?? ''}`).toString('base64');
		result.Authorization = `Basic ${token}`;
	}
	return result;
}

/** Reads the body, but stops as soon as it gets too large instead of loading all of it. */
async function readBody(res: Response) {
	const tooLarge = () => new CalendarError('Der Kalender ist zu groß.');
	const length = Number(res.headers.get('content-length') ?? 0);
	if (length > MAX_BYTES) {
		await res.body?.cancel();
		throw tooLarge();
	}
	if (!res.body) return '';
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_BYTES) {
			await reader.cancel();
			throw tooLarge();
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}

function statusError(status: number) {
	if (status === 401 || status === 403) {
		return new CalendarError('Anmeldung abgelehnt. Bitte Benutzername und App-Passwort prüfen.');
	}
	if (status === 404) return new CalendarError('Unter dieser Adresse gibt es keinen Kalender.');
	return new CalendarError(`Der Server antwortet mit Fehler ${status}.`);
}

async function request(fetchFn: Fetch, url: string, init: RequestInit) {
	try {
		return await fetchFn(url, {
			...init,
			redirect: 'follow',
			signal: AbortSignal.timeout(TIMEOUT)
		});
	} catch (e) {
		if (e instanceof BlockedAddressError) {
			throw new CalendarError(
				'Diese Adresse liegt im internen Netz. Der Betreiber kann sie mit CALDAV_ALLOW_HOSTS freigeben.'
			);
		}
		if (e instanceof Error && e.name === 'TimeoutError') {
			throw new CalendarError('Der Server antwortet nicht.');
		}
		throw new CalendarError('Der Server ist nicht erreichbar. Stimmt die Adresse?');
	}
}

const unescapeXml = (s: string) =>
	s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');

/** Contents of all elements with this local name, whatever namespace prefix the server uses. */
function elements(xml: string, name: string) {
	const re = new RegExp(
		`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}\\s*>`,
		'gi'
	);
	return [...xml.matchAll(re)].map((m) => m[1]);
}

const CALENDAR_QUERY = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
</c:calendar-query>`;

const LIST_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`;

const pathOf = (url: string) => decodeURIComponent(new URL(url).pathname).replace(/\/+$/, '');

/** When the link points at the list of all calendars, names the ones found there. */
async function calendarsBelow(fetchFn: Fetch, source: Source) {
	const res = await request(fetchFn, source.url, {
		method: 'PROPFIND',
		headers: headers(source, { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }),
		body: LIST_CALENDARS
	});
	if (res.status !== 207) return [];
	const names: string[] = [];
	const own = pathOf(source.url);
	for (const response of elements(await readBody(res), 'response')) {
		const type = elements(response, 'resourcetype')[0] ?? '';
		if (!/<(?:[\w.-]+:)?calendar[\s/>]/i.test(type)) continue;
		const href = unescapeXml(elements(response, 'href')[0] ?? '').trim();
		// The answer also lists the requested address itself.
		if (pathOf(new URL(href, source.url).toString()) === own) continue;
		const name = unescapeXml(elements(response, 'displayname')[0] ?? '').trim();
		names.push(name || decodeURIComponent(href.replace(/\/$/, '').split('/').pop() ?? ''));
	}
	return names.filter(Boolean);
}

const allCalendars = (names: string[]) =>
	new CalendarError(
		`Das ist die Adresse aller Kalender. Bitte die Adresse eines einzelnen Kalenders angeben (gefunden: ${names.join(', ')}).`
	);

const isIcs = (text: string) => text.trimStart().startsWith('BEGIN:VCALENDAR');

/**
 * Returns the calendar as iCalendar texts. Tries CalDAV first and falls back to downloading
 * the link as an ICS file, so Nextcloud calendars and public links both work.
 */
export async function fetchCalendar(source: Source, fetchFn: Fetch = calendarFetch): Promise<string[]> {
	const report = await request(fetchFn, source.url, {
		method: 'REPORT',
		headers: headers(source, { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }),
		body: CALENDAR_QUERY
	});
	if (report.status === 401) throw statusError(401);

	if (report.status === 207) {
		const body = await readBody(report);
		const data = elements(body, 'calendar-data').map(unescapeXml).filter(isIcs);
		if (data.length) return data;
		// An empty calendar answers like the address of all calendars; only the latter has some below.
		const names = await calendarsBelow(fetchFn, source);
		if (!names.length) return [];
		throw allCalendars(names);
	} else {
		await report.body?.cancel();
	}

	// Not CalDAV: a public ICS link, or the address of all calendars instead of one.
	const get = await request(fetchFn, source.url, {
		method: 'GET',
		headers: headers(source, { Accept: 'text/calendar, */*' })
	});
	if (!get.ok) throw statusError(get.status);
	const text = await readBody(get);
	if (isIcs(text)) return [text];

	const names = await calendarsBelow(fetchFn, source).catch(() => []);
	if (names.length) throw allCalendars(names);
	throw new CalendarError('Unter dieser Adresse gibt es keinen Kalender.');
}
