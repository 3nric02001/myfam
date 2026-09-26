import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { fetchCalendar, normalizeUrl } from './caldav';
import { decrypt, encrypt } from './secrets';
import {
	checkSubscription,
	createSubscription,
	deleteSubscription,
	getSubscription,
	listSubscriptionEvents,
	listSubscriptions,
	syncDue,
	syncSubscription,
	updateSubscription,
	type SubscriptionInput
} from './subscriptions';
import { calendarSubscription } from './db/schema';
import { seedFamily, testDb } from './test/setup';

const key = randomBytes(32);

const event = (uid: string, date: string, summary: string) =>
	`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${date}\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A multistatus answer like Nextcloud's, with its d:/cal: prefixes. */
const multistatus = (items: string[]) =>
	`<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
${items
	.map(
		(ics, i) => `<d:response><d:href>/remote.php/dav/calendars/enrico/personal/${i}.ics</d:href>
<d:propstat><d:prop><cal:calendar-data>${escape(ics)}</cal:calendar-data></d:prop>
<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
	)
	.join('\n')}
</d:multistatus>`;

type Call = { method: string; url: string; auth: string | null };

function fakeServer(handler: (call: Call) => Response) {
	const calls: Call[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		const call = { method: init?.method ?? 'GET', url, auth: headers.get('authorization') };
		calls.push(call);
		return handler(call);
	}) as typeof fetch;
	return { calls, fetchFn };
}

const input = (values: Partial<SubscriptionInput> = {}) => {
	const result = checkSubscription({
		name: 'Nextcloud',
		url: 'https://cloud.example.de/remote.php/dav/calendars/enrico/personal/',
		username: 'enrico',
		password: 'app-passwort',
		color: 'plum',
		...values
	});
	if ('error' in result) throw new Error(result.error);
	return result.subscription;
};

describe('secrets', () => {
	it('encrypts and decrypts, and fails with another key', () => {
		const value = encrypt(key, 'geheim');
		expect(value).not.toContain('geheim');
		expect(decrypt(key, value)).toBe('geheim');
		expect(decrypt(randomBytes(32), value)).toBeNull();
	});
});

describe('normalizeUrl', () => {
	it('turns webcal into https and rejects other schemes', () => {
		expect(normalizeUrl('webcal://example.de/cal.ics')).toBe('https://example.de/cal.ics');
		expect(normalizeUrl('file:///etc/passwd')).toBeNull();
		expect(normalizeUrl('https://user:pw@example.de/')).toBeNull();
		expect(normalizeUrl('kein link')).toBeNull();
	});
});

describe('fetchCalendar', () => {
	it('reads events from a CalDAV report with basic auth', async () => {
		const { calls, fetchFn } = fakeServer(
			() => new Response(multistatus([event('a', '20261001', 'A & B')]), { status: 207 })
		);
		const texts = await fetchCalendar(
			{ url: 'https://cloud.example.de/cal/', username: 'enrico', password: 'pw' },
			fetchFn
		);
		expect(texts).toHaveLength(1);
		expect(texts[0]).toContain('SUMMARY:A & B');
		expect(calls[0].method).toBe('REPORT');
		expect(calls[0].auth).toBe(`Basic ${Buffer.from('enrico:pw').toString('base64')}`);
	});

	it('falls back to downloading an ICS link', async () => {
		const { calls, fetchFn } = fakeServer(({ method }) =>
			method === 'REPORT'
				? new Response('nope', { status: 405 })
				: new Response(event('a', '20261001', 'A'), { status: 200 })
		);
		const texts = await fetchCalendar({ url: 'https://example.de/cal.ics' }, fetchFn);
		expect(texts[0]).toContain('SUMMARY:A');
		expect(calls.map((c) => c.method)).toEqual(['REPORT', 'GET']);
	});

	it('explains rejected logins', async () => {
		const { fetchFn } = fakeServer(() => new Response('', { status: 401 }));
		await expect(fetchCalendar({ url: 'https://example.de/' }, fetchFn)).rejects.toThrow(
			/App-Passwort/
		);
	});

	it('names the calendars when given the address of all calendars', async () => {
		const home = '/remote.php/dav/calendars/enrico/';
		const { fetchFn } = fakeServer(({ method }) => {
			if (method === 'REPORT')
				return new Response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 });
			return new Response(
				`<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
<d:response><d:href>${home}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
<d:response><d:href>${home}personal/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>Persönlich</d:displayname></d:prop></d:propstat></d:response>
</d:multistatus>`,
				{ status: 207 }
			);
		});
		await expect(
			fetchCalendar({ url: `https://cloud.example.de${home}` }, fetchFn)
		).rejects.toThrow(/aller Kalender.*Persönlich/);
	});

	it('accepts an empty calendar', async () => {
		const url = 'https://cloud.example.de/remote.php/dav/calendars/enrico/leer/';
		const { fetchFn } = fakeServer(({ method }) =>
			method === 'REPORT'
				? new Response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 })
				: new Response(
						`<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/remote.php/dav/calendars/enrico/leer/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>`,
						{ status: 207 }
					)
		);
		await expect(fetchCalendar({ url }, fetchFn)).resolves.toEqual([]);
	});
});

describe('subscriptions', () => {
	it('stores the password encrypted and never lists it', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const row = await createSubscription(db, key, family.id, owner.id, input());
		expect(row.password).not.toContain('app-passwort');
		expect(decrypt(key, row.password!)).toBe('app-passwort');
		const [listed] = await listSubscriptions(db, family.id);
		expect(listed).not.toHaveProperty('password');
		expect(listed.hasPassword).toBe(true);
	});

	it('syncs events that the whole family sees with the subscription as source', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const other = await seedFamily(db, 'bert');
		const row = await createSubscription(db, key, family.id, owner.id, input());
		const { fetchFn } = fakeServer(
			() => new Response(multistatus([event('a', '20261001', 'Elternabend')]), { status: 207 })
		);
		expect(
			await syncSubscription(db, key, row, fetchFn, new Date('2026-09-26T12:00:00Z'))
		).toBeNull();
		const events = await listSubscriptionEvents(db, family.id, '2026-10-01', '2026-10-31');
		expect(events).toEqual([
			expect.objectContaining({ title: 'Elternabend', source: 'Nextcloud', color: 'plum' })
		]);
		// Other families don't see it.
		expect(await listSubscriptionEvents(db, other.family.id, '2026-10-01', '2026-10-31')).toEqual(
			[]
		);
	});

	it('replaces events on the next sync and keeps them when the server fails', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const row = await createSubscription(db, key, family.id, owner.id, input());
		let answer = () => new Response(multistatus([event('a', '20261001', 'Alt')]), { status: 207 });
		const { fetchFn } = fakeServer(() => answer());
		await syncSubscription(db, key, row, fetchFn);
		answer = () => new Response(multistatus([event('b', '20261002', 'Neu')]), { status: 207 });
		await syncSubscription(db, key, row, fetchFn);
		const titles = async () =>
			(await listSubscriptionEvents(db, family.id, '2026-10-01', '2026-10-31')).map((e) => e.title);
		expect(await titles()).toEqual(['Neu']);

		answer = () => new Response('', { status: 503 });
		expect(await syncSubscription(db, key, row, fetchFn)).toMatch(/503/);
		expect(await titles()).toEqual(['Neu']);
		expect((await getSubscription(db, family.id, row.id))?.error).toMatch(/503/);
	});

	it('asks for the password again when the address moves to another server', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const row = await createSubscription(db, key, family.id, owner.id, input());
		const moved = await updateSubscription(
			db,
			key,
			family.id,
			row.id,
			input({ url: 'https://evil.example.com/cal/', password: '' })
		);
		expect(moved).toHaveProperty('error');
		const renamed = await updateSubscription(
			db,
			key,
			family.id,
			row.id,
			input({ name: 'Arbeit', password: '' })
		);
		expect(renamed && 'subscription' in renamed && renamed.subscription?.password).toBe(
			row.password
		);
	});

	it('only lets a family change its own subscriptions', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const other = await seedFamily(db, 'bert');
		const row = await createSubscription(db, key, family.id, owner.id, input());
		expect(await updateSubscription(db, key, other.family.id, row.id, input())).toBeNull();
		expect(await deleteSubscription(db, other.family.id, row.id)).toBe(false);
		expect(await deleteSubscription(db, family.id, row.id)).toBe(true);
	});

	it('syncs only subscriptions that are due', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const row = await createSubscription(db, key, family.id, owner.id, input());
		const { calls, fetchFn } = fakeServer(() => new Response(multistatus([]), { status: 207 }));
		const now = new Date('2026-09-26T12:00:00Z');
		expect(await syncDue(db, key, fetchFn, now)).toBe(1);
		expect(await syncDue(db, key, fetchFn, new Date(now.getTime() + 60_000))).toBe(0);
		expect(await syncDue(db, key, fetchFn, new Date(now.getTime() + 16 * 60_000))).toBe(1);
		expect(calls.length).toBeGreaterThan(0);
		await db.delete(calendarSubscription).where(eq(calendarSubscription.id, row.id));
	});
});
