import { lte } from 'drizzle-orm';
import type { DB } from './db/client';
import { invite, passwordReset, session } from './db/schema';

// Expired sign-ins and links are otherwise only removed when someone uses them again.

export function purgeExpired(db: DB, now = new Date()) {
	return {
		sessions: db.delete(session).where(lte(session.expiresAt, now)).run().changes,
		invites: db.delete(invite).where(lte(invite.expiresAt, now)).run().changes,
		resets: db.delete(passwordReset).where(lte(passwordReset.expiresAt, now)).run().changes
	};
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Tidies up once at start and then every hour. */
export function startCleanup(db: DB) {
	if (timer) return;
	const run = () => {
		try {
			purgeExpired(db);
		} catch (err) {
			console.error('Aufräumen fehlgeschlagen:', err);
		}
	};
	run();
	timer = setInterval(run, 3600_000);
	timer.unref();
}
