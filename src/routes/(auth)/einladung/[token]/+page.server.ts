import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession, createUser, findUserByEmail, setSessionFamily } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { acceptInvite, findInvite } from '$lib/server/families';
import { checkAccount, field, rawField } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const found = await findInvite(db, params.token);
	if (!found) error(404, 'Diese Einladung ist ungültig oder abgelaufen.');
	return { familyName: found.familyName, user: locals.user };
};

export const actions: Actions = {
	join: async ({ params, locals }) => {
		if (!locals.user || !locals.sessionId) redirect(303, `/login?next=/einladung/${params.token}`);
		const familyId = await acceptInvite(db, params.token, locals.user.id);
		if (!familyId) return fail(400, { message: 'Diese Einladung ist ungültig oder abgelaufen.' });
		await setSessionFamily(db, locals.sessionId, familyId);
		redirect(303, '/dashboard');
	},

	register: async (event) => {
		const form = await event.request.formData();
		const input = {
			name: field(form, 'name'),
			email: field(form, 'email'),
			password: rawField(form, 'password')
		};
		const values = { name: input.name, email: input.email };

		const problem = checkAccount(input);
		if (problem) return fail(400, { ...values, message: problem });
		if (!(await findInvite(db, event.params.token))) {
			return fail(400, { ...values, message: 'Diese Einladung ist ungültig oder abgelaufen.' });
		}
		if (await findUserByEmail(db, input.email)) {
			return fail(400, {
				...values,
				message: 'Zu dieser E-Mail gibt es schon ein Konto. Bitte melde dich an.'
			});
		}

		const newUser = await createUser(db, input);
		const familyId = await acceptInvite(db, event.params.token, newUser.id);
		const { token, expiresAt } = await createSession(db, newUser.id, familyId);
		setSessionCookie(event, token, expiresAt);
		redirect(303, '/dashboard');
	}
};
