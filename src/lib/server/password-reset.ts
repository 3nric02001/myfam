import { and, eq, gt } from 'drizzle-orm';
import type { DB } from './db/client';
import { membership, passwordReset, session, user } from './db/schema';
import { generateToken, hashPassword, hashToken } from './auth';
import { checkPassword } from './validation';

// "Forgot password" without e-mail: an admin creates a one-time link for a member and sends it
// to them, like an invite. Opening it lets the member choose a new password.

export const RESET_HOURS = 24;

/**
 * An admin may reset a member's password only if they are an admin in every family the member
 * belongs to. Otherwise an admin of one family could take over an account and see what it sees
 * in another family.
 */
export async function canResetPassword(db: DB, adminId: string, targetId: string) {
	if (adminId === targetId) return false;
	const target = await db
		.select({ familyId: membership.familyId })
		.from(membership)
		.where(eq(membership.userId, targetId));
	if (!target.length) return false;
	const adminOf = new Set(
		(
			await db
				.select({ familyId: membership.familyId })
				.from(membership)
				.where(and(eq(membership.userId, adminId), eq(membership.role, 'admin')))
		).map((m) => m.familyId)
	);
	return target.every((m) => adminOf.has(m.familyId));
}

/** Creates a new link for the member; an older link of theirs stops working. */
export async function createPasswordReset(db: DB, targetId: string, createdBy: string | null) {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + RESET_HOURS * 3600_000);
	await db.delete(passwordReset).where(eq(passwordReset.userId, targetId));
	await db
		.insert(passwordReset)
		.values({ id: hashToken(token), userId: targetId, createdBy, expiresAt });
	return { token, expiresAt };
}

/** The person a valid link belongs to, or null. */
export async function findPasswordReset(db: DB, token: string) {
	const [row] = await db
		.select({ id: passwordReset.id, userId: user.id, name: user.name, email: user.email })
		.from(passwordReset)
		.innerJoin(user, eq(passwordReset.userId, user.id))
		.where(and(eq(passwordReset.id, hashToken(token)), gt(passwordReset.expiresAt, new Date())));
	return row ?? null;
}

/**
 * Sets the new password, uses up the link and signs the person out everywhere (which also stops
 * the notifications of those devices). Returns the user id, or an error message.
 */
export async function resetPassword(
	db: DB,
	token: string,
	newPassword: string
): Promise<{ userId: string } | { error: string }> {
	const found = await findPasswordReset(db, token);
	if (!found) return { error: 'Dieser Link ist ungültig oder abgelaufen.' };
	const problem = checkPassword(newPassword);
	if (problem) return { error: problem };
	const passwordHash = await hashPassword(newPassword);
	db.transaction((tx) => {
		tx.update(user).set({ passwordHash }).where(eq(user.id, found.userId)).run();
		tx.delete(session).where(eq(session.userId, found.userId)).run();
		tx.delete(passwordReset).where(eq(passwordReset.userId, found.userId)).run();
	});
	return { userId: found.userId };
}
