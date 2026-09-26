import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { createSession, findUserByEmail, registrationOpen, verifyPassword } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { listFamiliesOfUser } from '$lib/server/families';
import { loginKeys, loginLimiter, waitLabel } from '$lib/server/login-limit';
import { safeNext } from '$lib/server/redirects';
import { field, rawField } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { registrationOpen: registrationOpen(db, env) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = field(form, 'email');
		const password = rawField(form, 'password');

		// Behind a reverse proxy every request comes from the proxy, unless it passes the
		// client's address along (ADDRESS_HEADER), so only then does the IP count.
		const keys = loginKeys(email, env.ADDRESS_HEADER ? event.getClientAddress() : null);
		const wait = loginLimiter.retryAfter(keys);
		if (wait > 0) {
			return fail(429, {
				email,
				message: `Zu viele Fehlversuche. Bitte versuche es ${waitLabel(wait)} noch einmal.`
			});
		}

		const found = email ? await findUserByEmail(db, email) : null;
		if (!found || !(await verifyPassword(found.passwordHash, password))) {
			loginLimiter.fail(keys.map((k) => k.key));
			return fail(400, { email, message: 'E-Mail oder Passwort ist falsch.' });
		}
		loginLimiter.succeed(keys[0].key);

		const families = await listFamiliesOfUser(db, found.id);
		const { token, expiresAt } = await createSession(db, found.id, families[0]?.id ?? null);
		setSessionCookie(event, token, expiresAt);

		// Only follow paths on this site, so the login can't be used to redirect elsewhere.
		redirect(303, safeNext(event.url.searchParams.get('next'), event.url.origin));
	}
};
