import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession, createUser, findUserByEmail } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { createFamily } from '$lib/server/families';
import { checkAccount, field, rawField } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const input = {
			name: field(form, 'name'),
			email: field(form, 'email'),
			password: rawField(form, 'password'),
			familyName: field(form, 'familyName')
		};
		const values = { name: input.name, email: input.email, familyName: input.familyName };

		const problem = checkAccount(input);
		if (problem) return fail(400, { ...values, message: problem });
		if (!input.familyName || input.familyName.length > 60) {
			return fail(400, {
				...values,
				message: 'Bitte gib einen Familiennamen an (max. 60 Zeichen).'
			});
		}
		if (await findUserByEmail(db, input.email)) {
			return fail(400, { ...values, message: 'Zu dieser E-Mail gibt es schon ein Konto.' });
		}

		const newUser = await createUser(db, input);
		const newFamily = await createFamily(db, input.familyName, newUser.id);
		const { token, expiresAt } = await createSession(db, newUser.id, newFamily.id);
		setSessionCookie(event, token, expiresAt);
		redirect(303, '/einkauf');
	}
};
