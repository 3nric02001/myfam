import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Queue, checkPhoto } from './ocr';

describe('checkPhoto', () => {
	it('accepts a normal photo', () => {
		const jpg = new Uint8Array(readFileSync(new URL('./test/images/123x45.jpg', import.meta.url)));
		expect(checkPhoto(jpg)).toBeNull();
	});

	it('turns away files that are no image or have too many pixels', () => {
		expect(checkPhoto(new TextEncoder().encode('kein Bild'))).toMatch(/JPEG/);
		const png = new Uint8Array(readFileSync(new URL('./test/images/123x45.png', import.meta.url)));
		// 20000 × 20000 pixels in the PNG header.
		png.set([0, 0, 0x4e, 0x20, 0, 0, 0x4e, 0x20], 16);
		expect(checkPhoto(png)).toMatch(/Pixel/);
	});
});

describe('Queue', () => {
	it('runs one job at a time and turns away too many waiting ones', async () => {
		const queue = new Queue(1);
		let running = 0;
		let most = 0;
		const releases: (() => void)[] = [];
		const job = () =>
			new Promise<number>((resolve) => {
				running++;
				most = Math.max(most, running);
				releases.push(() => {
					running--;
					resolve(running);
				});
			});
		const first = queue.run(job);
		const second = queue.run(job);
		await expect(queue.run(job)).rejects.toThrow(/andere Kassenzettel/);
		await Promise.resolve();
		releases.shift()!();
		await first;
		await new Promise((r) => setTimeout(r, 0));
		releases.shift()!();
		await second;
		expect(most).toBe(1);
		// The queue is free again.
		const third = queue.run(async () => 'ok');
		await expect(third).resolves.toBe('ok');
	});
});
