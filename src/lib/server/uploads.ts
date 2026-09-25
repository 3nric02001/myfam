import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Uploaded images are stored as plain files named by their database id, in a folder next to
// the database (so they live in the same Docker volume and are part of the same backup).
// They are only ever served through a route that checks permissions first.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function uploadDir(databaseUrl: string, override?: string) {
	return override || path.join(path.dirname(path.resolve(databaseUrl)), 'uploads');
}

/** Detects the image type from the file's first bytes. Only common photo formats are allowed. */
export function sniffImageType(bytes: Uint8Array): string | null {
	const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
	if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
	if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
	if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
		return 'image/webp';
	}
	return null;
}

const filePath = (dir: string, id: string) => {
	if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('invalid image id');
	return path.join(dir, id);
};

export async function saveImageFile(dir: string, id: string, bytes: Uint8Array) {
	await mkdir(dir, { recursive: true });
	await writeFile(filePath(dir, id), bytes);
}

export async function readImageFile(dir: string, id: string) {
	return readFile(filePath(dir, id));
}

export async function deleteImageFiles(dir: string, ids: string[]) {
	await Promise.all(ids.map((id) => rm(filePath(dir, id), { force: true })));
}
