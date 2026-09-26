import { env } from '$env/dynamic/private';
import { db } from './db';
import { loadKey } from './secrets';
import { SYNC_INTERVAL, syncDue } from './subscriptions';

// Runtime wiring for calendar subscriptions: the encryption key and the periodic sync.

let key: Buffer | null = null;

/** SECRET_KEY, or the key file next to the database. */
export function secretKey() {
	key ??= loadKey(env.SECRET_KEY, env.DATABASE_URL ?? 'myfam.db');
	return key;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Fetches due subscriptions now and then every few minutes. */
export function startCalendarSync() {
	if (timer) return;
	const run = () =>
		syncDue(db, secretKey()).catch((e) =>
			console.error('Kalender-Abos: Abgleich fehlgeschlagen', e)
		);
	setTimeout(run, 5_000);
	timer = setInterval(run, Math.min(SYNC_INTERVAL, 5 * 60_000));
	timer.unref();
}
