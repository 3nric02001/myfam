import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createSession, createUser, validateSession, verifyPassword } from './auth';
import { deleteAccount } from './account';
import { createEvent } from './calendar';
import { purgeExpired } from './cleanup';
import {
	calendarEvent,
	calendarEventShare,
	family,
	invite,
	passwordReset,
	planningFolder,
	session,
	task,
	user
} from './db/schema';
import {
	acceptInvite,
	createFamily,
	createInvite,
	deleteFamily,
	listFamiliesOfUser,
	removeMember,
	setRole
} from './families';
import {
	canResetPassword,
	createPasswordReset,
	findPasswordReset,
	resetPassword
} from './password-reset';
import { addImage, createCard, createFolder } from './planning';
import { createTask } from './tasks';
import { seedFamily, testDb } from './test/setup';

type Db = ReturnType<typeof testDb>;

async function join(db: Db, familyId: string, adminId: string, name: string) {
	const u = await createUser(db, {
		email: `${name}@example.com`,
		name,
		password: 'geheim-passwort'
	});
	await acceptInvite(db, (await createInvite(db, familyId, adminId)).token, u.id);
	return u;
}

const event = (visibility: 'family' | 'shared' | 'private', sharedWith: string[] = []) => ({
	title: 'Termin',
	notes: null,
	startDate: '2026-10-01',
	startTime: null,
	endDate: '2026-10-01',
	endTime: null,
	visibility,
	sharedWith,
	reminder: null,
	repeat: null,
	repeatUntil: null
});

const todo = (assigneeId: string | null, visibility: 'family' | 'private' = 'family') => ({
	title: 'Müll rausbringen',
	notes: null,
	dueDate: '2026-10-01',
	assigneeId,
	visibility,
	shareWith: []
});

describe('leaving a family', () => {
	it('unassigns tasks and removes shares of the person who left', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		const ben = await join(db, fam.id, anna.id, 'ben');
		const t = await createTask(db, fam.id, anna.id, todo(ben.id));
		const e = await createEvent(db, fam.id, anna.id, event('shared', [ben.id]));

		await removeMember(db, fam.id, ben.id);

		const [after] = await db.select().from(task).where(eq(task.id, t.id));
		expect(after.assigneeId).toBeNull();
		expect(
			await db.select().from(calendarEventShare).where(eq(calendarEventShare.eventId, e.id))
		).toEqual([]);
	});
});

describe('deleting a family', () => {
	it('removes everything in it and returns the image files', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		const other = await seedFamily(db, 'cara');
		const v = { familyId: fam.id, userId: anna.id, isAdmin: true };
		const folder = await createFolder(db, v, 'Urlaub', { visibility: 'family', shareWith: [] });
		const card = await createCard(db, v, folder.id, 'Packliste');
		const image = await addImage(db, v, card!.id, { mimeType: 'image/png', size: 10 });

		expect(await deleteFamily(db, fam.id)).toEqual([image!.id]);
		expect(await listFamiliesOfUser(db, anna.id)).toEqual([]);
		expect(await db.select().from(planningFolder)).toEqual([]);
		// Other families are untouched.
		expect((await db.select().from(family)).map((f) => f.id)).toEqual([other.family.id]);
	});
});

describe('password reset links', () => {
	it('may only be created by an admin of every family the person is in', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		const ben = await join(db, fam.id, anna.id, 'ben');
		expect(await canResetPassword(db, anna.id, ben.id)).toBe(true);
		expect(await canResetPassword(db, ben.id, anna.id)).toBe(false);
		expect(await canResetPassword(db, anna.id, anna.id)).toBe(false);

		// Ben is also in Cara's family: Anna must not take over his account there.
		const cara = await seedFamily(db, 'cara');
		await acceptInvite(db, (await createInvite(db, cara.family.id, cara.owner.id)).token, ben.id);
		expect(await canResetPassword(db, anna.id, ben.id)).toBe(false);
		await setRole(db, cara.family.id, anna.id, 'admin'); // Anna is no member there: no effect.
		expect(await canResetPassword(db, anna.id, ben.id)).toBe(false);
	});

	it('sets a new password once and signs out everywhere', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		const ben = await join(db, fam.id, anna.id, 'ben');
		const old = await createSession(db, ben.id, fam.id);
		const first = await createPasswordReset(db, ben.id, anna.id);
		const { token } = await createPasswordReset(db, ben.id, anna.id);
		// Only the newest link works.
		expect(await findPasswordReset(db, first.token)).toBeNull();
		expect((await findPasswordReset(db, token))?.name).toBe('ben');

		expect(await resetPassword(db, token, 'kurz')).toEqual({ error: expect.stringMatching(/10/) });
		expect(await resetPassword(db, token, 'ganz-neues-passwort')).toEqual({ userId: ben.id });
		const [row] = await db.select().from(user).where(eq(user.id, ben.id));
		expect(await verifyPassword(row.passwordHash, 'ganz-neues-passwort')).toBe(true);
		expect(await validateSession(db, old.token)).toBeNull();
		expect(await resetPassword(db, token, 'noch-ein-passwort')).toEqual({
			error: expect.stringMatching(/ungültig/)
		});
	});
});

describe('deleting an account', () => {
	it('needs the password and another admin where others are left', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		const ben = await join(db, fam.id, anna.id, 'ben');
		expect(await deleteAccount(db, anna.id, 'falsch')).toEqual({
			ok: false,
			reason: expect.stringMatching(/Passwort/)
		});
		expect(await deleteAccount(db, anna.id, 'geheim-passwort')).toEqual({
			ok: false,
			reason: expect.stringMatching(/Admin/)
		});
		await setRole(db, fam.id, ben.id, 'admin');
		expect(await deleteAccount(db, anna.id, 'geheim-passwort')).toEqual({
			ok: true,
			imageIds: []
		});
		expect(await db.select().from(user).where(eq(user.id, anna.id))).toEqual([]);
	});

	it('deletes private entries and families the person is alone in, keeps the rest', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		const ben = await join(db, fam.id, anna.id, 'ben');
		await setRole(db, fam.id, ben.id, 'admin');
		const shared = await createEvent(db, fam.id, anna.id, event('family'));
		await createEvent(db, fam.id, anna.id, event('private'));
		await createTask(db, fam.id, anna.id, todo(anna.id, 'private'));
		await createFamily(db, 'Nur Anna', anna.id);

		const result = await deleteAccount(db, anna.id, 'geheim-passwort');
		expect(result.ok).toBe(true);
		const events = await db.select().from(calendarEvent);
		expect(events.map((e) => e.id)).toEqual([shared.id]);
		expect(events[0].createdBy).toBeNull();
		expect(await db.select().from(task)).toEqual([]);
		expect((await db.select().from(family)).map((f) => f.id)).toEqual([fam.id]);
	});
});

describe('purgeExpired', () => {
	it('removes expired sessions, invites and reset links', async () => {
		const db = testDb();
		const { owner: anna, family: fam } = await seedFamily(db, 'anna');
		await createSession(db, anna.id, fam.id);
		await createInvite(db, fam.id, anna.id);
		await createPasswordReset(db, anna.id, null);
		expect(purgeExpired(db)).toEqual({ sessions: 0, invites: 0, resets: 0 });
		expect(purgeExpired(db, new Date(Date.now() + 40 * 86_400_000))).toEqual({
			sessions: 1,
			invites: 1,
			resets: 1
		});
		expect(await db.select().from(session)).toEqual([]);
		expect(await db.select().from(invite)).toEqual([]);
		expect(await db.select().from(passwordReset)).toEqual([]);
	});
});
