import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listMembers } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import {
	canEditTask,
	checkTask,
	deleteTask,
	getTask,
	memberIds,
	notifyAssignee,
	setTaskDone,
	taskFromForm,
	updateTask
} from '$lib/server/tasks';
import { parseVisibility } from '$lib/server/visibility';
import { appSender } from '$lib/server/app-sender';
import { today } from '$lib/dates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { user, family } = requireFamily(locals);
	const task = await getTask(db, family.id, user.id, params.id);
	if (!task) error(404, 'Diese Aufgabe gibt es nicht (mehr).');
	const members = (await listMembers(db, family.id)).map(({ id, name }) => ({ id, name }));
	const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
	return {
		task,
		today: today(),
		members,
		creator: nameOf(task.createdBy),
		assignee: nameOf(task.assigneeId),
		doneBy: nameOf(task.doneBy),
		editable: canEditTask(task, { id: user.id, role: family.role }),
		isCreator: task.createdBy === user.id
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const existing = await getTask(db, family.id, user.id, params.id);
		if (!existing) error(404);
		const ids = await memberIds(db, family.id);
		// Share rows never include the creator, so parse on the creator's behalf.
		const vis = parseVisibility(form, ids, existing.createdBy ?? user.id);
		if ('error' in vis) return fail(400, { message: vis.error });
		const result = checkTask({ ...taskFromForm(form), ...vis }, existing.createdBy ?? user.id, ids);
		if ('error' in result) return fail(400, { message: result.error });
		if (
			!(await updateTask(db, family.id, { id: user.id, role: family.role }, params.id, result.task))
		) {
			return fail(403, { message: 'Du darfst diese Aufgabe nicht ändern.' });
		}
		notifyAssignee(
			db,
			appSender(),
			{ id: params.id, ...result.task },
			user,
			existing.assigneeId
		).catch((err) => console.error('Push zur Aufgabe fehlgeschlagen:', err));
		redirect(303, `/kalender?tag=${result.task.dueDate}`);
	},

	toggle: async ({ request, locals, params }) => {
		const { user, family } = requireFamily(locals);
		const done = (await request.formData()).get('done') === 'true';
		await setTaskDone(db, family.id, user.id, params.id, done);
	},

	delete: async ({ locals, params }) => {
		const { user, family } = requireFamily(locals);
		const task = await getTask(db, family.id, user.id, params.id);
		if (!(await deleteTask(db, family.id, { id: user.id, role: family.role }, params.id))) {
			return fail(403, { message: 'Du darfst diese Aufgabe nicht löschen.' });
		}
		redirect(303, task ? `/kalender?tag=${task.dueDate}` : '/kalender/aufgaben');
	}
};
