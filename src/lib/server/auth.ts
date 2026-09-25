import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './db/client';
import { session, user } from './db/schema';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
export const sessionCookieName = 'session';

export function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string) {
	return hash(password);
}

export function verifyPassword(passwordHash: string, password: string) {
	return verify(passwordHash, password);
}

export function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

export async function createSession(db: DB, userId: string, familyId: string | null) {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
	await db.insert(session).values({ id: hashToken(token), userId, familyId, expiresAt });
	return { token, expiresAt };
}

/** Returns the session and its user, or null. Sessions close to expiry are extended. */
export async function validateSession(db: DB, token: string) {
	const [row] = await db
		.select({
			session,
			user: { id: user.id, email: user.email, name: user.name }
		})
		.from(session)
		.innerJoin(user, eq(session.userId, user.id))
		.where(eq(session.id, hashToken(token)));

	if (!row) return null;

	const now = Date.now();
	if (now >= row.session.expiresAt.getTime()) {
		await db.delete(session).where(eq(session.id, row.session.id));
		return null;
	}

	if (now >= row.session.expiresAt.getTime() - (SESSION_DAYS / 2) * DAY) {
		row.session.expiresAt = new Date(now + SESSION_DAYS * DAY);
		await db
			.update(session)
			.set({ expiresAt: row.session.expiresAt })
			.where(eq(session.id, row.session.id));
	}

	return row;
}

export async function invalidateSession(db: DB, sessionId: string) {
	await db.delete(session).where(eq(session.id, sessionId));
}

export async function setSessionFamily(db: DB, sessionId: string, familyId: string | null) {
	await db.update(session).set({ familyId }).where(eq(session.id, sessionId));
}

export async function findUserByEmail(db: DB, email: string) {
	const [row] = await db
		.select()
		.from(user)
		.where(eq(user.email, normalizeEmail(email)));
	return row ?? null;
}

export async function createUser(db: DB, input: { email: string; name: string; password: string }) {
	const [row] = await db
		.insert(user)
		.values({
			email: normalizeEmail(input.email),
			name: input.name.trim(),
			passwordHash: await hashPassword(input.password)
		})
		.returning();
	return row;
}
