import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createSession,
	createUser,
	findUserByEmail,
	invalidateSession,
	validateSession,
	verifyPassword
} from './auth';
import { session } from './db/schema';
import { testDb } from './test/setup';

describe('auth', () => {
	it('stores a password hash, not the password', async () => {
		const db = testDb();
		const u = await createUser(db, {
			email: ' Anna@Example.com ',
			name: 'Anna',
			password: 'richtig-lang'
		});
		expect(u.email).toBe('anna@example.com');
		expect(u.passwordHash).not.toContain('richtig-lang');
		expect(await verifyPassword(u.passwordHash, 'richtig-lang')).toBe(true);
		expect(await verifyPassword(u.passwordHash, 'falsch')).toBe(false);
		expect((await findUserByEmail(db, 'ANNA@example.com'))?.id).toBe(u.id);
	});

	it('validates, and invalidates, sessions by token', async () => {
		const db = testDb();
		const u = await createUser(db, { email: 'a@b.de', name: 'A', password: 'richtig-lang' });
		const { token } = await createSession(db, u.id, null);

		const valid = await validateSession(db, token);
		expect(valid?.user.id).toBe(u.id);
		expect(valid?.session.id).not.toBe(token);
		expect(await validateSession(db, 'falsches-token')).toBeNull();

		await invalidateSession(db, valid!.session.id);
		expect(await validateSession(db, token)).toBeNull();
	});

	it('rejects expired sessions', async () => {
		const db = testDb();
		const u = await createUser(db, { email: 'a@b.de', name: 'A', password: 'richtig-lang' });
		const { token } = await createSession(db, u.id, null);
		await db
			.update(session)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(session.userId, u.id));
		expect(await validateSession(db, token)).toBeNull();
	});
});
