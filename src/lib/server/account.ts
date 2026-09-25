import { and, eq, ne } from 'drizzle-orm';
import type { DB } from './db/client';
import { session, user } from './db/schema';
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

/** Changes the password and signs the user out everywhere except in the current session. */
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
	await db.delete(session).where(and(eq(session.userId, userId), ne(session.id, currentSessionId)));
	return { ok: true };
}
