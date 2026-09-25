import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listMembers } from '$lib/server/families';
import { requireViewer } from '$lib/server/guards';
import { createFolder, listFolders } from '$lib/server/planning';
import { field } from '$lib/server/validation';
import { parseVisibility } from '$lib/server/visibility';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { viewer, family } = requireViewer(locals);
	return {
		folders: await listFolders(db, viewer),
		members: (await listMembers(db, family.id)).map((m) => ({ id: m.id, name: m.name }))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { viewer, family, user } = requireViewer(locals);
		const form = await request.formData();
		const name = field(form, 'name');
		if (!name) return fail(400, { message: 'Wie soll der Ordner heißen?' });
		if (name.length > 60) return fail(400, { message: 'Der Name ist zu lang (max. 60 Zeichen).' });
		const members = await listMembers(db, family.id);
		const access = parseVisibility(
			form,
			members.map((m) => m.id),
			user.id
		);
		if ('error' in access) return fail(400, { message: access.error });
		const folder = await createFolder(db, viewer, name, access);
		redirect(303, `/planung/${folder.id}`);
	}
};
