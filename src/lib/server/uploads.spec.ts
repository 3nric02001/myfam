import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	deleteImageFiles,
	readImageFile,
	saveImageFile,
	sniffImageType,
	uploadDir
} from './uploads';

describe('uploads', () => {
	it('recognises image types by content, not by name', () => {
		expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
		expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
			'image/png'
		);
		expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
		expect(sniffImageType(new TextEncoder().encode('<svg onload="alert(1)">'))).toBeNull();
		expect(sniffImageType(new TextEncoder().encode('<html>'))).toBeNull();
	});

	it('stores files next to the database', () => {
		expect(uploadDir('/data/myfam.db')).toBe('/data/uploads');
		expect(uploadDir('/data/myfam.db', '/srv/bilder')).toBe('/srv/bilder');
	});

	it('saves, reads and deletes files by id only', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'myfam-'));
		const id = crypto.randomUUID();
		await saveImageFile(dir, id, new Uint8Array([1, 2, 3]));
		expect([...(await readImageFile(dir, id))]).toEqual([1, 2, 3]);
		await deleteImageFiles(dir, [id]);
		await expect(readImageFile(dir, id)).rejects.toThrow();
		await expect(readImageFile(dir, '../myfam.db')).rejects.toThrow('invalid image id');
		await rm(dir, { recursive: true });
	});
});
