import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireViewer } from '$lib/server/guards';
import {
	LIMITS,
	addBlock,
	addComment,
	checkComment,
	deleteComment,
	listComments,
	updateComment,
	addImage,
	deleteBlock,
	deleteCard,
	getBlock,
	getCard,
	listBlocks,
	moveBlock,
	parseBlock,
	removeImageRecords,
	renameCard,
	updateBlock
} from '$lib/server/planning';
import { uploads } from '$lib/server/upload-dir';
import {
	MAX_IMAGE_BYTES,
	deleteImageFiles,
	saveImageFile,
	sniffImageType
} from '$lib/server/uploads';
import { field } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { viewer } = requireViewer(locals);
	const card = await getCard(db, viewer, params.cardId);
	if (!card || card.folderId !== params.folderId) error(404, 'Karte nicht gefunden.');
	return {
		card,
		blocks: await listBlocks(db, viewer, card.id),
		comments: await listComments(db, viewer, card.id)
	};
};

export const actions: Actions = {
	rename: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const title = field(await request.formData(), 'title');
		if (!title) return fail(400, { message: 'Der Titel darf nicht leer sein.' });
		if (title.length > LIMITS.title) return fail(400, { message: 'Der Titel ist zu lang.' });
		if (!(await renameCard(db, viewer, params.cardId, title))) error(404, 'Karte nicht gefunden.');
	},

	deleteCard: async ({ locals, params }) => {
		const { viewer } = requireViewer(locals);
		const images = await deleteCard(db, viewer, params.cardId);
		if (images) await deleteImageFiles(uploads(), images);
		redirect(303, `/planung/${params.folderId}`);
	},

	add: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const form = await request.formData();
		const block = parseBlock(field(form, 'type'), form);
		if ('error' in block) return fail(400, { message: block.error, blockId: null });
		if (!(await addBlock(db, viewer, params.cardId, block))) error(404, 'Karte nicht gefunden.');
		return { added: true };
	},

	image: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const form = await request.formData();
		const file = form.get('file');
		const caption = field(form, 'caption').slice(0, LIMITS.caption);
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { message: 'Bitte wähle ein Bild aus.', blockId: null });
		}
		if (file.size > MAX_IMAGE_BYTES) {
			return fail(400, { message: 'Das Bild ist zu groß (max. 10 MB).', blockId: null });
		}
		const bytes = new Uint8Array(await file.arrayBuffer());
		const mimeType = sniffImageType(bytes);
		if (!mimeType) {
			return fail(400, {
				message: 'Nur Bilder im Format JPEG, PNG, WebP oder GIF sind möglich.',
				blockId: null
			});
		}

		const image = await addImage(db, viewer, params.cardId, { mimeType, size: bytes.length });
		if (!image) error(404, 'Karte nicht gefunden.');
		try {
			await saveImageFile(uploads(), image.id, bytes);
		} catch (e) {
			await removeImageRecords(db, viewer, [image.id]);
			console.error('Bild konnte nicht gespeichert werden', e);
			return fail(500, { message: 'Das Bild konnte nicht gespeichert werden.', blockId: null });
		}
		await addBlock(db, viewer, params.cardId, {
			type: 'image',
			data: { imageId: image.id, caption }
		});
		return { added: true };
	},

	update: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const form = await request.formData();
		const blockId = field(form, 'blockId');
		const block = await getBlock(db, viewer, params.cardId, blockId);
		if (!block) error(404, 'Inhalt nicht gefunden.');

		if (block.type === 'image') {
			const caption = field(form, 'caption').slice(0, LIMITS.caption);
			await updateBlock(db, viewer, params.cardId, blockId, { ...block.data, caption });
			return { updated: blockId };
		}
		const parsed = parseBlock(block.type, form);
		if ('error' in parsed) return fail(400, { message: parsed.error, blockId });
		await updateBlock(db, viewer, params.cardId, blockId, parsed.data);
		return { updated: blockId };
	},

	deleteBlock: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const images = await deleteBlock(
			db,
			viewer,
			params.cardId,
			field(await request.formData(), 'blockId')
		);
		if (images) await deleteImageFiles(uploads(), images);
	},

	move: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const form = await request.formData();
		const direction = field(form, 'direction') === 'up' ? -1 : 1;
		await moveBlock(db, viewer, params.cardId, field(form, 'blockId'), direction);
	},

	comment: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const checked = checkComment(field(await request.formData(), 'text'));
		if ('error' in checked) return fail(400, { commentError: checked.error, commentId: null });
		if (!(await addComment(db, viewer, params.cardId, checked.text))) {
			error(404, 'Karte nicht gefunden.');
		}
		return { commented: true };
	},

	editComment: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const form = await request.formData();
		const commentId = field(form, 'commentId');
		const checked = checkComment(field(form, 'text'));
		if ('error' in checked) return fail(400, { commentError: checked.error, commentId });
		if (!(await updateComment(db, viewer, params.cardId, commentId, checked.text))) {
			return fail(403, {
				commentError: 'Nur eigene Kommentare können geändert werden.',
				commentId
			});
		}
		return { commented: true };
	},

	deleteComment: async ({ request, locals, params }) => {
		const { viewer } = requireViewer(locals);
		const commentId = field(await request.formData(), 'commentId');
		if (!(await deleteComment(db, viewer, params.cardId, commentId))) {
			return fail(403, {
				commentError: 'Nur eigene Kommentare können gelöscht werden.',
				commentId
			});
		}
	}
};
