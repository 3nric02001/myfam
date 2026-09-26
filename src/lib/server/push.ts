import webpush from 'web-push';
import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from './db/client';
import { appSetting, notificationOff, pushSubscription, type NotificationKind } from './db/schema';

// Web Push straight from this server to the browser's push service (Google, Apple, Mozilla,
// Microsoft), signed with our own VAPID key. No third-party account is needed.

export type VapidKeys = { publicKey: string; privateKey: string };

/**
 * The VAPID keys from VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, or generated once and kept in the
 * database. Changing them later means every device has to switch notifications on again.
 */
export function vapidKeys(db: DB, env: Record<string, string | undefined> = {}): VapidKeys {
	if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
		return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
	}
	const stored = db.select().from(appSetting).where(eq(appSetting.key, 'vapid')).get();
	if (stored) return JSON.parse(stored.value) as VapidKeys;
	const keys = webpush.generateVAPIDKeys();
	db.insert(appSetting)
		.values({ key: 'vapid', value: JSON.stringify(keys) })
		.onConflictDoNothing()
		.run();
	// Another process may have won the race, so read back what is stored.
	const row = db.select().from(appSetting).where(eq(appSetting.key, 'vapid')).get();
	return row ? (JSON.parse(row.value) as VapidKeys) : keys;
}

/**
 * The contact the push services see. Apple requires a mailto: or https: address that is not
 * localhost, so the public URL is used when it is https.
 */
export function vapidSubject(env: Record<string, string | undefined> = {}) {
	if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT;
	if (env.ORIGIN?.startsWith('https://')) return env.ORIGIN;
	return 'mailto:myfam@example.com';
}

// Only real push services, so the server can't be made to post to arbitrary (internal) hosts.
const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'push.services.mozilla.com',
	'push.apple.com',
	'notify.windows.com'
];

export function isPushEndpoint(endpoint: string) {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:' || url.port) return false;
	return PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

export type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Reads the JSON of a browser PushSubscription. Returns null if it is not one. */
export function parseSubscription(value: unknown): SubscriptionInput | null {
	if (!value || typeof value !== 'object') return null;
	const { endpoint, keys } = value as { endpoint?: unknown; keys?: Record<string, unknown> };
	const key = /^[A-Za-z0-9_-]+={0,2}$/;
	if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isPushEndpoint(endpoint))
		return null;
	const p256dh = keys?.p256dh;
	const auth = keys?.auth;
	if (typeof p256dh !== 'string' || p256dh.length > 200 || !key.test(p256dh)) return null;
	if (typeof auth !== 'string' || auth.length > 100 || !key.test(auth)) return null;
	return { endpoint, keys: { p256dh, auth } };
}

/** A short device name for the settings list, from the user agent. */
export function deviceLabel(userAgent: string | null) {
	if (!userAgent) return null;
	const os = /iPhone/.test(userAgent)
		? 'iPhone'
		: /iPad/.test(userAgent)
			? 'iPad'
			: /Android/.test(userAgent)
				? 'Android'
				: /Mac OS X/.test(userAgent)
					? 'Mac'
					: /Windows/.test(userAgent)
						? 'Windows'
						: /Linux/.test(userAgent)
							? 'Linux'
							: null;
	const browser = /Edg\//.test(userAgent)
		? 'Edge'
		: /Firefox\//.test(userAgent)
			? 'Firefox'
			: /SamsungBrowser\//.test(userAgent)
				? 'Samsung Internet'
				: /Chrome\//.test(userAgent)
					? 'Chrome'
					: /Safari\//.test(userAgent)
						? 'Safari'
						: null;
	return [os, browser].filter(Boolean).join(' · ') || null;
}

/**
 * Stores a device for the user. A device that belonged to someone else before (another person
 * signed in on the same phone) now belongs to this user. The device is tied to the session, so
 * signing out (or a password change signing out other devices) stops its notifications.
 */
export async function saveSubscription(
	db: DB,
	userId: string,
	sessionId: string | null,
	sub: SubscriptionInput,
	device: string | null
) {
	await db
		.insert(pushSubscription)
		.values({
			userId,
			sessionId,
			endpoint: sub.endpoint,
			p256dh: sub.keys.p256dh,
			auth: sub.keys.auth,
			device
		})
		.onConflictDoUpdate({
			target: pushSubscription.endpoint,
			set: { userId, sessionId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device }
		});
}

export async function listSubscriptions(db: DB, userId: string) {
	return db
		.select({
			id: pushSubscription.id,
			endpoint: pushSubscription.endpoint,
			device: pushSubscription.device,
			createdAt: pushSubscription.createdAt
		})
		.from(pushSubscription)
		.where(eq(pushSubscription.userId, userId))
		.orderBy(pushSubscription.createdAt);
}

export async function deleteSubscription(
	db: DB,
	userId: string,
	by: { id: string } | { endpoint: string }
) {
	await db
		.delete(pushSubscription)
		.where(
			and(
				eq(pushSubscription.userId, userId),
				'id' in by ? eq(pushSubscription.id, by.id) : eq(pushSubscription.endpoint, by.endpoint)
			)
		);
}

export type PushMessage = {
	title: string;
	body: string;
	/** Page opened when the notification is tapped. */
	url: string;
	/** A newer notification with the same tag replaces the older one. */
	tag?: string;
};

type Target = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Sends one message to one device. Resolves with the HTTP status of the push service. */
export type Sender = (target: Target, payload: string) => Promise<{ statusCode: number }>;

export function webPushSender(keys: VapidKeys, subject: string): Sender {
	return (target, payload) =>
		webpush.sendNotification(target, payload, {
			vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
			// Reminders are useless once they are a day late.
			TTL: 60 * 60 * 24,
			urgency: 'high'
		});
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
	'morning',
	'event',
	'task',
	'evening',
	'comment',
	'meals',
	'receipt'
];

export function isNotificationKind(value: string): value is NotificationKind {
	return (NOTIFICATION_KINDS as string[]).includes(value);
}

/** The kinds of notifications the user switched off. */
export async function notificationsOff(db: DB, userId: string) {
	const rows = await db
		.select({ kind: notificationOff.kind })
		.from(notificationOff)
		.where(eq(notificationOff.userId, userId));
	return rows.map((r) => r.kind);
}

export async function setNotification(db: DB, userId: string, kind: NotificationKind, on: boolean) {
	if (on) {
		await db
			.delete(notificationOff)
			.where(and(eq(notificationOff.userId, userId), eq(notificationOff.kind, kind)));
	} else {
		await db.insert(notificationOff).values({ userId, kind }).onConflictDoNothing();
	}
}

/**
 * Sends the message to every device of the given users. With a kind, users who switched that
 * kind off are skipped. Devices the push service no longer knows (404/410, e.g. the app was
 * removed) are deleted. Returns how many devices got it.
 */
export async function sendToUsers(
	db: DB,
	userIds: string[],
	message: PushMessage,
	send: Sender,
	kind?: NotificationKind
) {
	let ids = [...new Set(userIds)];
	if (kind && ids.length) {
		const off = await db
			.select({ userId: notificationOff.userId })
			.from(notificationOff)
			.where(and(eq(notificationOff.kind, kind), inArray(notificationOff.userId, ids)));
		const skip = new Set(off.map((r) => r.userId));
		ids = ids.filter((id) => !skip.has(id));
	}
	if (ids.length === 0) return 0;
	const subs = await db
		.select()
		.from(pushSubscription)
		.where(inArray(pushSubscription.userId, ids));
	const payload = JSON.stringify(message);
	let delivered = 0;
	await Promise.all(
		subs.map(async (sub) => {
			try {
				await send(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					payload
				);
				delivered++;
			} catch (err) {
				const status = (err as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410) {
					await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
				} else {
					console.error(`Push an ${new URL(sub.endpoint).host} fehlgeschlagen:`, status ?? err);
				}
			}
		})
	);
	return delivered;
}

/** The sender for this installation's keys, from the environment or the database. */
export function pushSender(db: DB, env: Record<string, string | undefined> = {}) {
	return webPushSender(vapidKeys(db, env), vapidSubject(env));
}
