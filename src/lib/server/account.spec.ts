import { describe, expect, it } from 'vitest';
import { changeEmail, changeName, changePassword } from './account';
import {
	createSession,
	createUser,
	findUserByEmail,
	validateSession,
	verifyPassword
} from './auth';
import { testDb } from './test/setup';

async function setup() {
	const db = testDb();
	const u = await createUser(db, {
		email: 'anna@example.com',
		name: 'Anna',
		password: 'altes-passwort'
	});
	return { db, u };
}

describe('account', () => {
	it('changes the name', async () => {
		const { db, u } = await setup();
		expect(await changeName(db, u.id, '  Anna Maria ')).toEqual({ ok: true });
		expect((await findUserByEmail(db, 'anna@example.com'))?.name).toBe('Anna Maria');
		expect((await changeName(db, u.id, '   ')).ok).toBe(false);
	});

	it('changes the email only with the current password', async () => {
		const { db, u } = await setup();
		const wrong = await changeEmail(db, u.id, {
			email: 'neu@example.com',
			currentPassword: 'falsch'
		});
		expect(wrong).toEqual({ ok: false, reason: 'Das aktuelle Passwort ist falsch.' });

		const invalid = await changeEmail(db, u.id, {
			email: 'kaputt',
			currentPassword: 'altes-passwort'
		});
		expect(invalid.ok).toBe(false);

		const ok = await changeEmail(db, u.id, {
			email: ' Neu@Example.com ',
			currentPassword: 'altes-passwort'
		});
		expect(ok).toEqual({ ok: true });
		expect((await findUserByEmail(db, 'neu@example.com'))?.id).toBe(u.id);
		expect(await findUserByEmail(db, 'anna@example.com')).toBeNull();
	});

	it('refuses an email that belongs to someone else', async () => {
		const { db, u } = await setup();
		await createUser(db, { email: 'ben@example.com', name: 'Ben', password: 'richtig-lang' });
		const result = await changeEmail(db, u.id, {
			email: 'BEN@example.com',
			currentPassword: 'altes-passwort'
		});
		expect(result).toEqual({ ok: false, reason: 'Zu dieser E-Mail gibt es schon ein Konto.' });
	});

	it('changes the password and signs out other sessions', async () => {
		const { db, u } = await setup();
		const here = await createSession(db, u.id, null);
		const elsewhere = await createSession(db, u.id, null);
		const hereId = (await validateSession(db, here.token))!.session.id;

		const wrong = await changePassword(db, u.id, hereId, {
			currentPassword: 'falsch',
			newPassword: 'neues-passwort'
		});
		expect(wrong.ok).toBe(false);
		expect(await validateSession(db, elsewhere.token)).not.toBeNull();

		const short = await changePassword(db, u.id, hereId, {
			currentPassword: 'altes-passwort',
			newPassword: 'kurz'
		});
		expect(short.ok).toBe(false);

		const ok = await changePassword(db, u.id, hereId, {
			currentPassword: 'altes-passwort',
			newPassword: 'neues-passwort'
		});
		expect(ok).toEqual({ ok: true });

		const stored = (await findUserByEmail(db, 'anna@example.com'))!;
		expect(await verifyPassword(stored.passwordHash, 'neues-passwort')).toBe(true);
		expect(await validateSession(db, here.token)).not.toBeNull();
		expect(await validateSession(db, elsewhere.token)).toBeNull();
	});
});
