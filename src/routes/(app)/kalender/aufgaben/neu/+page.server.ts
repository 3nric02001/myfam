import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isDate } from '$lib/server/calendar';
import { listMembers } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import { checkTask, createTask, memberIds, notifyAssignee, taskFromForm } from '$lib/server/tasks';
import { appSender } from '$lib/server/app-sender';
import { parseVisibility } from '$lib/server/visibility';
import { today } from '$lib/dates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { family } = requireFamily(locals);
	const date = url.searchParams.get('datum') ?? '';
	const members = await listMembers(db, family.id);
	return {
		date: isDate(date) ? date : today(),
		members: members.map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const ids = await memberIds(db, family.id);
		const vis = parseVisibility(form, ids, user.id);
		if ('error' in vis) return fail(400, { message: vis.error });
		const result = checkTask({ ...taskFromForm(form), ...vis }, user.id, ids);
		if ('error' in result) return fail(400, { message: result.error });
		const task = await createTask(db, family.id, user.id, result.task);
		// Don't hold up the page for the push service.
		notifyAssignee(db, appSender(), task, user).catch((err) =>
			console.error('Push zur neuen Aufgabe fehlgeschlagen:', err)
		);
		redirect(303, `/kalender?tag=${task.dueDate}`);
	}
};
