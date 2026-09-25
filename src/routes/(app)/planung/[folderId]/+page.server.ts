import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listMembers } from '$lib/server/families';
import { requireViewer } from '$lib/server/guards';
import { createCard, deleteFolder, getFolder, listCards, updateFolder } from '$lib/server/planning';
import { uploads } from '$lib/server/upload-dir';
import { deleteImageFiles } from '$lib/server/uploads';
import { field } from '$lib/server/validation';
import { parseVisibility } from '$lib/server/visibility';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { viewer, family } = requireViewer(locals);
	const folder = await getFolder(db, viewer, params.folderId);
	if (!folder) error(404, 'Ordner nicht gefunden.');
	return {
		folder,
		cards: await listCards(db, viewer, folder.id),
		members: (await listMembers(db, family.id)).map((m) => ({ id: m.id, name: m.name }))
	};
};

export const actions: Actions = {
	addCard: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const title = field(await request.formData(), 'title');
		if (!title) return fail(400, { message: 'Wie soll die Karte heißen?' });
		if (title.length > 100) return fail(400, { message: 'Der Titel ist zu lang.' });
		const card = await createCard(db, viewer, params.folderId, title);
		if (!card) error(404, 'Ordner nicht gefunden.');
		redirect(303, `/planung/${params.folderId}/${card.id}`);
	},

	update: async ({ request, locals, params }) => {
		const { viewer, family, user } = requireViewer(locals);
		const form = await request.formData();
		const name = field(form, 'name');
		if (!name) return fail(400, { message: 'Wie soll der Ordner heißen?' });
		if (name.length > 60) return fail(400, { message: 'Der Name ist zu lang (max. 60 Zeichen).' });
		const members = await listMembers(db, family.id);
		const folder = await getFolder(db, viewer, params.folderId);
		if (!folder) error(404, 'Ordner nicht gefunden.');
		const access = parseVisibility(
			form,
			members.map((m) => m.id),
			folder.createdById ?? user.id
		);
		if ('error' in access) return fail(400, { message: access.error });
		if (!(await updateFolder(db, viewer, folder.id, name, access))) {
			return fail(403, { message: 'Nur wer den Ordner angelegt hat, kann ihn ändern.' });
		}
		return { saved: true };
	},

	delete: async ({ locals, params }) => {
		const { viewer } = requireViewer(locals);
		const images = await deleteFolder(db, viewer, params.folderId);
		if (!images)
			return fail(403, { message: 'Nur wer den Ordner angelegt hat, kann ihn löschen.' });
		await deleteImageFiles(uploads(), images);
		redirect(303, '/planung');
	}
};
