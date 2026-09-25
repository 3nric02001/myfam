import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession, findUserByEmail, verifyPassword } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { listFamiliesOfUser } from '$lib/server/families';
import { field, rawField } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = field(form, 'email');
		const password = rawField(form, 'password');

		const found = email ? await findUserByEmail(db, email) : null;
		if (!found || !(await verifyPassword(found.passwordHash, password))) {
			return fail(400, { email, message: 'E-Mail oder Passwort ist falsch.' });
		}

		const families = await listFamiliesOfUser(db, found.id);
		const { token, expiresAt } = await createSession(db, found.id, families[0]?.id ?? null);
		setSessionCookie(event, token, expiresAt);

		// Only follow local paths, so the login can't be used to redirect to another site.
		const next = event.url.searchParams.get('next') ?? '';
		redirect(303, /^\/(?![/\\])/.test(next) ? next : '/');
	}
};
