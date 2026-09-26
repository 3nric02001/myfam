import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setSessionFamily } from '$lib/server/auth';
import { createFamily } from '$lib/server/families';
import { requireUser } from '$lib/server/guards';
import { field } from '$lib/server/validation';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { user, sessionId } = requireUser(locals);
		const name = field(await request.formData(), 'familyName');
		if (!name || name.length > 60) {
			return fail(400, { message: 'Bitte gib einen Familiennamen an (max. 60 Zeichen).' });
		}
		const created = await createFamily(db, name, user.id);
		await setSessionFamily(db, sessionId, created.id);
		redirect(303, '/dashboard');
	}
};
