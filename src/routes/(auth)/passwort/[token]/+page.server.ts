import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { listFamiliesOfUser } from '$lib/server/families';
import { findPasswordReset, resetPassword } from '$lib/server/password-reset';
import { rawField } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const found = await findPasswordReset(db, params.token);
	if (!found) error(404, 'Dieser Link ist ungültig oder abgelaufen.');
	return { name: found.name, email: found.email };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const password = rawField(form, 'password');
		if (password !== rawField(form, 'confirmPassword')) {
			return fail(400, { message: 'Die Passwörter stimmen nicht überein.' });
		}
		const result = await resetPassword(db, event.params.token, password);
		if ('error' in result) return fail(400, { message: result.error });
		const families = await listFamiliesOfUser(db, result.userId);
		const { token, expiresAt } = await createSession(db, result.userId, families[0]?.id ?? null);
		setSessionCookie(event, token, expiresAt);
		redirect(303, '/dashboard');
	}
};
