import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { listTasks, setTaskDone } from '$lib/server/tasks';
import { field } from '$lib/server/validation';
import { today } from '$lib/dates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, family } = requireFamily(locals);
	const mine = url.searchParams.get('filter') === 'meine';
	return { mine, today: today(), ...(await listTasks(db, family.id, user.id, { mine })) };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		await setTaskDone(db, family.id, user.id, field(form, 'id'), field(form, 'done') === 'true');
	}
};
