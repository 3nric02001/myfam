import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { invalidateSession } from '$lib/server/auth';
import { deleteSessionCookie } from '$lib/server/cookies';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.sessionId) await invalidateSession(db, event.locals.sessionId);
		deleteSessionCookie(event);
		redirect(303, '/login');
	}
};
