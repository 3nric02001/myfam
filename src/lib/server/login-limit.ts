// Slows down password guessing. Failed logins are counted per e-mail address and, when the
// reverse proxy passes the real client address (ADDRESS_HEADER), per IP. After too many
// failures within the window, logins for that key pause until the window has passed.
// Kept in memory: the app runs as one process, and a restart only resets the counters.

export const MAX_PER_EMAIL = 5;
export const MAX_PER_IP = 20;
export const WINDOW_MS = 15 * 60_000;

type Entry = { failures: number[] };

export class LoginLimiter {
	private entries = new Map<string, Entry>();

	constructor(private now: () => number = Date.now) {}

	private recent(key: string) {
		const entry = this.entries.get(key);
		if (!entry) return [];
		const since = this.now() - WINDOW_MS;
		entry.failures = entry.failures.filter((t) => t > since);
		if (!entry.failures.length) this.entries.delete(key);
		return entry.failures;
	}

	/** Milliseconds until another attempt is allowed, or 0. */
	retryAfter(keys: { key: string; max: number }[]) {
		let wait = 0;
		for (const { key, max } of keys) {
			const failures = this.recent(key);
			if (failures.length >= max) {
				wait = Math.max(wait, failures[failures.length - max] + WINDOW_MS - this.now());
			}
		}
		return wait;
	}

	fail(keys: string[]) {
		const at = this.now();
		for (const key of keys) {
			const entry = this.entries.get(key) ?? { failures: [] };
			entry.failures.push(at);
			this.entries.set(key, entry);
		}
		// Forget old entries now and then, so the map can't grow without bound.
		if (this.entries.size > 10_000) for (const key of [...this.entries.keys()]) this.recent(key);
	}

	succeed(key: string) {
		this.entries.delete(key);
	}
}

export const loginLimiter = new LoginLimiter();

/** The keys a login attempt counts against. The IP only counts if it is the real client's. */
export function loginKeys(email: string, ip: string | null) {
	const keys = [{ key: `email:${email.trim().toLowerCase()}`, max: MAX_PER_EMAIL }];
	if (ip) keys.push({ key: `ip:${ip}`, max: MAX_PER_IP });
	return keys;
}

/** "in 1 Minute" / "in 12 Minuten". */
export function waitLabel(ms: number) {
	const minutes = Math.max(1, Math.ceil(ms / 60_000));
	return minutes === 1 ? 'in 1 Minute' : `in ${minutes} Minuten`;
}
