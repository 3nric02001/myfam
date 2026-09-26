import { describe, expect, it } from 'vitest';
import { LoginLimiter, MAX_PER_EMAIL, WINDOW_MS, loginKeys, waitLabel } from './login-limit';

describe('login limiter', () => {
	it('pauses an address after too many failures and lets it try again later', () => {
		let now = 1_000_000;
		const limiter = new LoginLimiter(() => now);
		const keys = loginKeys('Anna@Example.com', null);
		for (let i = 0; i < MAX_PER_EMAIL; i++) {
			expect(limiter.retryAfter(keys)).toBe(0);
			limiter.fail(keys.map((k) => k.key));
			now += 1000;
		}
		expect(limiter.retryAfter(loginKeys('anna@example.com', null))).toBeGreaterThan(0);
		// Another address is not affected.
		expect(limiter.retryAfter(loginKeys('ben@example.com', null))).toBe(0);
		now += WINDOW_MS;
		expect(limiter.retryAfter(keys)).toBe(0);
	});

	it('counts the IP across addresses when it is known', () => {
		const limiter = new LoginLimiter(() => 0);
		for (let i = 0; i < 20; i++) {
			limiter.fail(loginKeys(`user${i}@example.com`, '203.0.113.9').map((k) => k.key));
		}
		expect(limiter.retryAfter(loginKeys('neu@example.com', '203.0.113.9'))).toBeGreaterThan(0);
		expect(limiter.retryAfter(loginKeys('neu@example.com', '198.51.100.1'))).toBe(0);
	});

	it('forgets the failures of an address after a successful login', () => {
		const limiter = new LoginLimiter(() => 0);
		const keys = loginKeys('a@b.de', null);
		for (let i = 0; i < MAX_PER_EMAIL - 1; i++) limiter.fail(keys.map((k) => k.key));
		limiter.succeed(keys[0].key);
		limiter.fail(keys.map((k) => k.key));
		expect(limiter.retryAfter(keys)).toBe(0);
	});

	it('says how long to wait', () => {
		expect(waitLabel(10_000)).toBe('in 1 Minute');
		expect(waitLabel(14 * 60_000 + 1)).toBe('in 15 Minuten');
	});
});
