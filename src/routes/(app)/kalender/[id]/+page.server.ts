import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	canEdit,
	checkEvent,
	deleteEvent,
	eventFromForm,
	getEvent,
	updateEvent
} from '$lib/server/calendar';
import { listMembers } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { user, family } = requireFamily(locals);
	const event = await getEvent(db, family.id, user.id, params.id);
	if (!event) error(404, 'Diesen Termin gibt es nicht (mehr).');
	const members = await listMembers(db, family.id);
	return {
		event,
		creator: members.find((m) => m.id === event.createdBy)?.name ?? null,
		editable: canEdit(event, { id: user.id, role: family.role }),
		isCreator: event.createdBy === user.id,
		members: members.filter((m) => m.id !== event.createdBy).map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const { user, family } = requireFamily(locals);
		const result = checkEvent(eventFromForm(await request.formData()));
		if ('error' in result) return fail(400, { message: result.error });
		const viewer = { id: user.id, role: family.role };
		if (!(await updateEvent(db, family.id, viewer, params.id, result.event))) {
			return fail(403, { message: 'Du darfst diesen Termin nicht ändern.' });
		}
		redirect(303, `/kalender?tag=${result.event.startDate}`);
	},

	delete: async ({ locals, params }) => {
		const { user, family } = requireFamily(locals);
		const event = await getEvent(db, family.id, user.id, params.id);
		if (!(await deleteEvent(db, family.id, { id: user.id, role: family.role }, params.id))) {
			return fail(403, { message: 'Du darfst diesen Termin nicht löschen.' });
		}
		redirect(303, event ? `/kalender?tag=${event.startDate}` : '/kalender');
	}
};
