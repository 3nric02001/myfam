import { describe, expect, it } from 'vitest';
import { createUser } from './auth';
import {
	acceptInvite,
	createInvite,
	findInvite,
	listFamiliesOfUser,
	listMembers,
	removeMember,
	setRole
} from './families';
import { invite } from './db/schema';
import { seedFamily, testDb } from './test/setup';

describe('families', () => {
	it('makes the creator admin of the new family', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		expect(await listFamiliesOfUser(db, owner.id)).toEqual([
			{ id: family.id, name: 'Familie anna', role: 'admin' }
		]);
	});

	it('lets an invite be used exactly once', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const ben = await createUser(db, {
			email: 'ben@example.com',
			name: 'Ben',
			password: 'x'.repeat(10)
		});
		const { token } = await createInvite(db, family.id, owner.id);

		expect(await acceptInvite(db, token, ben.id)).toBe(family.id);
		expect((await listMembers(db, family.id)).map((m) => [m.name, m.role])).toEqual([
			['anna', 'admin'],
			['Ben', 'member']
		]);
		expect(await findInvite(db, token)).toBeNull();
	});

	it('rejects expired invites', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const { token } = await createInvite(db, family.id, owner.id);
		await db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) });
		expect(await findInvite(db, token)).toBeNull();
	});

	it('never leaves a family without an admin', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		expect((await removeMember(db, family.id, owner.id)).ok).toBe(false);
		expect((await setRole(db, family.id, owner.id, 'member')).ok).toBe(false);
	});
});
