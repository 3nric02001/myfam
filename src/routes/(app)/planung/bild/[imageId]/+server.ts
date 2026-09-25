import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getImage } from '$lib/server/planning';
import { uploads } from '$lib/server/upload-dir';
import { readImageFile } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

// Images are only served after checking that the user may see the card they belong to.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || !locals.family) error(401, 'Nicht angemeldet.');
	const image = await getImage(
		db,
		{ familyId: locals.family.id, userId: locals.user.id, isAdmin: locals.family.role === 'admin' },
		params.imageId
	);
	if (!image) error(404, 'Bild nicht gefunden.');

	let bytes: Buffer;
	try {
		bytes = await readImageFile(uploads(), image.id);
	} catch {
		error(404, 'Bild nicht gefunden.');
	}
	return new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': image.mimeType,
			'content-length': String(bytes.length),
			// Only the browser may cache images, never a shared proxy.
			'cache-control': 'private, max-age=86400',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'"
		}
	});
};
