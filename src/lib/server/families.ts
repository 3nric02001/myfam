import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { family, invite, membership, user, type Role } from './db/schema';
import { generateToken, hashToken } from './auth';
import type { State } from '$lib/holidays';

const INVITE_DAYS = 7;

export async function createFamily(db: DB, name: string, ownerId: string) {
	const [row] = await db.insert(family).values({ name: name.trim() }).returning();
	await db.insert(membership).values({ userId: ownerId, familyId: row.id, role: 'admin' });
	return row;
}

export async function listFamiliesOfUser(db: DB, userId: string) {
	return db
		.select({ id: family.id, name: family.name, role: membership.role })
		.from(membership)
		.innerJoin(family, eq(membership.familyId, family.id))
		.where(eq(membership.userId, userId))
		.orderBy(asc(membership.createdAt));
}

export async function getMembership(db: DB, userId: string, familyId: string) {
	const [row] = await db
		.select({ id: family.id, name: family.name, role: membership.role })
		.from(membership)
		.innerJoin(family, eq(membership.familyId, family.id))
		.where(and(eq(membership.userId, userId), eq(membership.familyId, familyId)));
	return row ?? null;
}

/** The family's Bundesland for regional holidays, or null for nationwide holidays only. */
export async function getFamilyState(db: DB, familyId: string) {
	const [row] = await db
		.select({ state: family.state })
		.from(family)
		.where(eq(family.id, familyId));
	return (row?.state ?? null) as State | null;
}

export async function setFamilyState(db: DB, familyId: string, state: State | null) {
	await db.update(family).set({ state }).where(eq(family.id, familyId));
}

export async function listMembers(db: DB, familyId: string) {
	return db
		.select({ id: user.id, name: user.name, email: user.email, role: membership.role })
		.from(membership)
		.innerJoin(user, eq(membership.userId, user.id))
		.where(eq(membership.familyId, familyId))
		.orderBy(sql`${user.name} collate nocase`);
}

export async function removeMember(db: DB, familyId: string, userId: string) {
	const members = await listMembers(db, familyId);
	const target = members.find((m) => m.id === userId);
	if (!target) return { ok: false as const, reason: 'Mitglied nicht gefunden.' };
	if (target.role === 'admin' && members.filter((m) => m.role === 'admin').length === 1) {
		return { ok: false as const, reason: 'Die Familie braucht mindestens einen Admin.' };
	}
	await db
		.delete(membership)
		.where(and(eq(membership.familyId, familyId), eq(membership.userId, userId)));
	return { ok: true as const };
}

export async function setRole(db: DB, familyId: string, userId: string, role: Role) {
	if (role === 'member') {
		const admins = (await listMembers(db, familyId)).filter((m) => m.role === 'admin');
		if (admins.length === 1 && admins[0].id === userId) {
			return { ok: false as const, reason: 'Die Familie braucht mindestens einen Admin.' };
		}
	}
	await db
		.update(membership)
		.set({ role })
		.where(and(eq(membership.familyId, familyId), eq(membership.userId, userId)));
	return { ok: true as const };
}

export async function createInvite(db: DB, familyId: string, createdBy: string) {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
	await db.insert(invite).values({ id: hashToken(token), familyId, createdBy, expiresAt });
	return { token, expiresAt };
}

/** Returns the family an invite token belongs to, if the invite is still valid. */
export async function findInvite(db: DB, token: string) {
	const [row] = await db
		.select({ inviteId: invite.id, familyId: family.id, familyName: family.name })
		.from(invite)
		.innerJoin(family, eq(invite.familyId, family.id))
		.where(and(eq(invite.id, hashToken(token)), gt(invite.expiresAt, new Date())));
	return row ?? null;
}

/** Adds the user to the invite's family and uses up the invite. */
export async function acceptInvite(db: DB, token: string, userId: string) {
	const found = await findInvite(db, token);
	if (!found) return null;
	await db
		.insert(membership)
		.values({ userId, familyId: found.familyId, role: 'member' })
		.onConflictDoNothing();
	await db.delete(invite).where(eq(invite.id, found.inviteId));
	return found.familyId;
}
