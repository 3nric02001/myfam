import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { DB } from './db/client';
import {
	calendarEvent,
	planningCard,
	planningFolder,
	planningImage,
	pushSubscription,
	session,
	task,
	user
} from './db/schema';
import { deleteFamily, detachMember, listFamiliesOfUser, listMembers } from './families';
import { findUserByEmail, hashPassword, normalizeEmail, verifyPassword } from './auth';
import { checkEmail, checkName, checkPassword } from './validation';

type Result = { ok: true } | { ok: false; reason: string };

const WRONG_PASSWORD = 'Das aktuelle Passwort ist falsch.';

async function checkCurrentPassword(db: DB, userId: string, password: string) {
	const [row] = await db
		.select({ passwordHash: user.passwordHash })
		.from(user)
		.where(eq(user.id, userId));
	return !!row && (await verifyPassword(row.passwordHash, password));
}

export async function changeName(db: DB, userId: string, name: string): Promise<Result> {
	const problem = checkName(name.trim());
	if (problem) return { ok: false, reason: problem };
	await db.update(user).set({ name: name.trim() }).where(eq(user.id, userId));
	return { ok: true };
}

export async function changeEmail(
	db: DB,
	userId: string,
	input: { email: string; currentPassword: string }
): Promise<Result> {
	const email = normalizeEmail(input.email);
	const problem = checkEmail(email);
	if (problem) return { ok: false, reason: problem };
	if (!(await checkCurrentPassword(db, userId, input.currentPassword))) {
		return { ok: false, reason: WRONG_PASSWORD };
	}
	const existing = await findUserByEmail(db, email);
	if (existing && existing.id !== userId) {
		return { ok: false, reason: 'Zu dieser E-Mail gibt es schon ein Konto.' };
	}
	await db.update(user).set({ email }).where(eq(user.id, userId));
	return { ok: true };
}

/**
 * Changes the password and signs the user out everywhere except in the current session, including
 * the push notifications of the other devices.
 */
export async function changePassword(
	db: DB,
	userId: string,
	currentSessionId: string,
	input: { currentPassword: string; newPassword: string }
): Promise<Result> {
	if (!(await checkCurrentPassword(db, userId, input.currentPassword))) {
		return { ok: false, reason: WRONG_PASSWORD };
	}
	const problem = checkPassword(input.newPassword);
	if (problem) return { ok: false, reason: problem };
	await db
		.update(user)
		.set({ passwordHash: await hashPassword(input.newPassword) })
		.where(eq(user.id, userId));
	// Deleting the sessions also removes their push devices; older devices without a session too.
	await db.delete(session).where(and(eq(session.userId, userId), ne(session.id, currentSessionId)));
	await db
		.delete(pushSubscription)
		.where(and(eq(pushSubscription.userId, userId), isNull(pushSubscription.sessionId)));
	return { ok: true };
}

/**
 * Deletes the account after checking the password. Families the person is alone in go with it;
 * in the others, their private entries are deleted and the rest stays for the family. A family
 * that would be left without an admin has to get another one first.
 * Returns the ids of image files to remove.
 */
export async function deleteAccount(
	db: DB,
	userId: string,
	password: string
): Promise<{ ok: true; imageIds: string[] } | { ok: false; reason: string }> {
	if (!(await checkCurrentPassword(db, userId, password))) {
		return { ok: false, reason: WRONG_PASSWORD };
	}
	const families = await listFamiliesOfUser(db, userId);
	const withMembers = [];
	for (const f of families) {
		const members = await listMembers(db, f.id);
		if (members.length === 1) continue;
		const admins = members.filter((m) => m.role === 'admin');
		if (admins.length === 1 && admins[0].id === userId) {
			return {
				ok: false,
				reason: `Mach zuerst jemand anderen in „${f.name}“ zum Admin oder lösche die Familie.`
			};
		}
		withMembers.push(f.id);
	}

	const imageIds: string[] = [];
	for (const f of families) {
		if (!withMembers.includes(f.id)) imageIds.push(...(await deleteFamily(db, f.id)));
	}
	for (const familyId of withMembers) {
		await detachMember(db, familyId, userId);
		const privateOf = <T extends typeof calendarEvent | typeof task | typeof planningFolder>(
			t: T
		) => and(eq(t.familyId, familyId), eq(t.createdBy, userId), eq(t.visibility, 'private'));
		const folders = await db
			.select({ id: planningFolder.id })
			.from(planningFolder)
			.where(privateOf(planningFolder));
		const folderIds = folders.map((f) => f.id);
		if (folderIds.length) {
			const images = await db
				.select({ id: planningImage.id })
				.from(planningImage)
				.innerJoin(planningCard, eq(planningImage.cardId, planningCard.id))
				.where(inArray(planningCard.folderId, folderIds));
			imageIds.push(...images.map((i) => i.id));
		}
		await db.delete(planningFolder).where(privateOf(planningFolder));
		await db.delete(calendarEvent).where(privateOf(calendarEvent));
		await db.delete(task).where(privateOf(task));
	}
	await db.delete(user).where(eq(user.id, userId));
	return { ok: true, imageIds };
}
