import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { sessionCookieName, setSessionFamily, validateSession } from '$lib/server/auth';
import { getMembership, listFamiliesOfUser } from '$lib/server/families';
import { setSessionCookie } from '$lib/server/cookies';

export const init: ServerInit = () => {
	if (env.ORIGIN) console.log(`MyFam erwartet Aufrufe über ${env.ORIGIN}`);
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;
	event.locals.family = null;

	const token = event.cookies.get(sessionCookieName);
	if (!token) return resolve(event);

	const result = await validateSession(db, token);
	if (!result) {
		event.cookies.delete(sessionCookieName, { path: '/' });
		return resolve(event);
	}

	setSessionCookie(event, token, result.session.expiresAt);
	event.locals.user = result.user;
	event.locals.sessionId = result.session.id;

	// Fall back to the user's first family if the chosen one is gone.
	let family = result.session.familyId
		? await getMembership(db, result.user.id, result.session.familyId)
		: null;
	if (!family) {
		family = (await listFamiliesOfUser(db, result.user.id))[0] ?? null;
		if (family?.id !== result.session.familyId) {
			await setSessionFamily(db, result.session.id, family?.id ?? null);
		}
	}
	event.locals.family = family;

	return resolve(event);
};
