import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { checkEvent, createEvent, eventFromForm, isDate } from '$lib/server/calendar';
import { listMembers } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import { today } from '$lib/dates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, family } = requireFamily(locals);
	const date = url.searchParams.get('datum') ?? '';
	const members = await listMembers(db, family.id);
	return {
		date: isDate(date) ? date : today(),
		members: members.filter((m) => m.id !== user.id).map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const result = checkEvent(eventFromForm(await request.formData()));
		if ('error' in result) return fail(400, { message: result.error });
		const event = await createEvent(db, family.id, user.id, result.event);
		redirect(303, `/kalender?tag=${event.startDate}`);
	}
};
