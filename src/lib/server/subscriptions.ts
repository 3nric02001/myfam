import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { calendarSubscription, subscriptionEvent } from './db/schema';
import { CalendarError, calendarFetch, fetchCalendar, normalizeUrl } from './caldav';
import { occurrences } from './ical';
import { decrypt, encrypt } from './secrets';
import { field } from './validation';
import { addDays, today } from '$lib/dates';
import { isSubscriptionColor, type SubscriptionColor } from '$lib/subscriptions';

// Calendars a family subscribes to (Nextcloud via CalDAV, or ICS links). Events are copied into
// subscription_event on every sync and are visible to the whole family. Admins manage them.

type Fetch = typeof fetch;

export type SubscriptionInput = {
	name: string;
	url: string;
	username: string;
	/** Empty keeps the stored password when editing. */
	password: string;
	color: string;
};

export type CheckedSubscription = {
	name: string;
	url: string;
	username: string | null;
	password: string;
	color: SubscriptionColor;
};

/** How often subscriptions are fetched again. */
export const SYNC_INTERVAL = 15 * 60_000;

export function subscriptionFromForm(form: FormData): SubscriptionInput {
	return {
		name: field(form, 'name'),
		url: field(form, 'url'),
		username: field(form, 'username'),
		password: typeof form.get('password') === 'string' ? (form.get('password') as string) : '',
		color: field(form, 'color')
	};
}

export function checkSubscription(
	input: SubscriptionInput
): { error: string } | { subscription: CheckedSubscription } {
	const name = input.name.trim();
	if (!name) return { error: 'Bitte gib einen Namen an, z. B. „Nextcloud“.' };
	if (name.length > 50) return { error: 'Der Name ist zu lang (max. 50 Zeichen).' };
	const url = normalizeUrl(input.url);
	if (!url) return { error: 'Bitte gib eine gültige Adresse an (https://…).' };
	const username = input.username.trim() || null;
	if (username && username.length > 200) return { error: 'Der Benutzername ist zu lang.' };
	if (input.password.length > 500) return { error: 'Das Passwort ist zu lang.' };
	return {
		subscription: {
			name,
			url,
			username,
			password: input.password,
			color: isSubscriptionColor(input.color) ? input.color : 'blue'
		}
	};
}

/** Subscriptions of a family, without passwords. */
export async function listSubscriptions(db: DB, familyId: string) {
	const rows = await db
		.select()
		.from(calendarSubscription)
		.where(eq(calendarSubscription.familyId, familyId))
		.orderBy(sql`${calendarSubscription.name} collate nocase`);
	return rows.map(({ password, ...rest }) => ({ ...rest, hasPassword: !!password }));
}

export async function getSubscription(db: DB, familyId: string, id: string) {
	const [row] = await db
		.select()
		.from(calendarSubscription)
		.where(and(eq(calendarSubscription.familyId, familyId), eq(calendarSubscription.id, id)));
	return row ?? null;
}

export async function createSubscription(
	db: DB,
	key: Buffer,
	familyId: string,
	createdBy: string,
	input: CheckedSubscription
) {
	const { password, ...values } = input;
	const [row] = await db
		.insert(calendarSubscription)
		.values({
			...values,
			familyId,
			createdBy,
			password: values.username && password ? encrypt(key, password) : null
		})
		.returning();
	return row;
}

/** Returns the updated row, null if it does not belong to the family, or an error. */
export async function updateSubscription(
	db: DB,
	key: Buffer,
	familyId: string,
	id: string,
	input: CheckedSubscription
) {
	const existing = await getSubscription(db, familyId, id);
	if (!existing) return null;
	const { password, ...values } = input;
	// Never send a stored password to another server than the one it was entered for.
	if (
		values.username &&
		!password &&
		existing.password &&
		new URL(existing.url).origin !== new URL(values.url).origin
	) {
		return {
			error: 'Die Adresse zeigt auf einen anderen Server. Bitte das Passwort erneut eingeben.'
		};
	}
	// No user name means a public link, so the password goes too.
	const stored = !values.username ? null : password ? encrypt(key, password) : existing.password;
	const [row] = await db
		.update(calendarSubscription)
		.set({ ...values, password: stored })
		.where(eq(calendarSubscription.id, id))
		.returning();
	return { subscription: row };
}

export async function deleteSubscription(db: DB, familyId: string, id: string) {
	const result = await db
		.delete(calendarSubscription)
		.where(and(eq(calendarSubscription.familyId, familyId), eq(calendarSubscription.id, id)));
	return result.changes > 0;
}

const running = new Set<string>();

/**
 * Fetches a subscription and replaces its events. Returns an error message (also stored on the
 * subscription) or null. Repeating events are expanded from a year ago to two years ahead.
 */
export async function syncSubscription(
	db: DB,
	key: Buffer,
	subscription: typeof calendarSubscription.$inferSelect,
	fetchFn: Fetch = calendarFetch,
	now = new Date()
): Promise<string | null> {
	if (running.has(subscription.id)) return null;
	running.add(subscription.id);
	try {
		let password: string | null = null;
		if (subscription.password) {
			password = decrypt(key, subscription.password);
			if (password === null) {
				throw new CalendarError(
					'Das gespeicherte Passwort lässt sich nicht mehr lesen. Bitte neu eingeben.'
				);
			}
		}
		const texts = await fetchCalendar(
			{ url: subscription.url, username: subscription.username, password },
			fetchFn
		);
		const day = today(now);
		const items = occurrences(texts, subscription.id, {
			from: addDays(day, -365),
			to: addDays(day, 730)
		});
		db.transaction((tx) => {
			tx.delete(subscriptionEvent)
				.where(eq(subscriptionEvent.subscriptionId, subscription.id))
				.run();
			// SQLite limits the number of parameters per statement.
			for (let i = 0; i < items.length; i += 500) {
				tx.insert(subscriptionEvent)
					.values(
						items.slice(i, i + 500).map((item) => ({
							...item,
							subscriptionId: subscription.id,
							familyId: subscription.familyId
						}))
					)
					.onConflictDoNothing()
					.run();
			}
			tx.update(calendarSubscription)
				.set({ syncedAt: now, error: null })
				.where(eq(calendarSubscription.id, subscription.id))
				.run();
		});
		return null;
	} catch (e) {
		const message =
			e instanceof CalendarError ? e.message : 'Der Kalender konnte nicht gelesen werden.';
		if (!(e instanceof CalendarError)) console.error('Kalender-Abo', subscription.id, e);
		// Keep the last events, so a short outage does not empty the calendar.
		await db
			.update(calendarSubscription)
			.set({ syncedAt: now, error: message })
			.where(eq(calendarSubscription.id, subscription.id));
		return message;
	} finally {
		running.delete(subscription.id);
	}
}

/** Syncs all subscriptions (of all families) not fetched within the interval. */
export async function syncDue(db: DB, key: Buffer, fetchFn: Fetch = calendarFetch, now = new Date()) {
	const due = await db
		.select()
		.from(calendarSubscription)
		.where(
			or(
				isNull(calendarSubscription.syncedAt),
				lt(calendarSubscription.syncedAt, new Date(now.getTime() - SYNC_INTERVAL + 30_000))
			)
		);
	for (const subscription of due) await syncSubscription(db, key, subscription, fetchFn, now);
	return due.length;
}

const eventColumns = {
	id: subscriptionEvent.id,
	title: subscriptionEvent.title,
	location: subscriptionEvent.location,
	notes: subscriptionEvent.notes,
	startDate: subscriptionEvent.startDate,
	startTime: subscriptionEvent.startTime,
	endDate: subscriptionEvent.endDate,
	endTime: subscriptionEvent.endTime,
	source: calendarSubscription.name,
	color: calendarSubscription.color
};

/** Subscribed events overlapping the date range (inclusive). Every family member sees them. */
export async function listSubscriptionEvents(db: DB, familyId: string, from: string, to: string) {
	return db
		.select(eventColumns)
		.from(subscriptionEvent)
		.innerJoin(calendarSubscription, eq(subscriptionEvent.subscriptionId, calendarSubscription.id))
		.where(
			and(
				eq(subscriptionEvent.familyId, familyId),
				lte(subscriptionEvent.startDate, to),
				gte(subscriptionEvent.endDate, from)
			)
		)
		.orderBy(
			asc(subscriptionEvent.startDate),
			sql`${subscriptionEvent.startTime} is not null`,
			asc(subscriptionEvent.startTime),
			asc(subscriptionEvent.title)
		);
}

export async function getSubscriptionEvent(db: DB, familyId: string, id: string) {
	const [row] = await db
		.select(eventColumns)
		.from(subscriptionEvent)
		.innerJoin(calendarSubscription, eq(subscriptionEvent.subscriptionId, calendarSubscription.id))
		.where(and(eq(subscriptionEvent.familyId, familyId), eq(subscriptionEvent.id, id)));
	return row ?? null;
}
