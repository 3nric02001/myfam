import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageSize } from './image-size';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`./test/images/${name}`, import.meta.url)));

describe('imageSize', () => {
	it('reads JPEG, PNG and WebP made by a browser', () => {
		expect(imageSize(fixture('123x45.jpg'), 'image/jpeg')).toEqual({ width: 123, height: 45 });
		expect(imageSize(fixture('123x45.png'), 'image/png')).toEqual({ width: 123, height: 45 });
		expect(imageSize(fixture('123x45.webp'), 'image/webp')).toEqual({ width: 123, height: 45 });
	});

	it('reads GIF and the simple WebP variants', () => {
		const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x27, 0x20, 0x4e]);
		expect(imageSize(gif, 'image/gif')).toEqual({ width: 10000, height: 20000 });

		const riff = (chunk: string, rest: number[]) =>
			new Uint8Array([
				...Buffer.from('RIFF\0\0\0\0WEBP'),
				...Buffer.from(chunk),
				...new Array(Math.max(0, 30 - 16 - rest.length)).fill(0),
				...rest
			]);
		// VP8 (lossy): width and height at bytes 26 and 28.
		const vp8 = riff('VP8 ', []);
		vp8.set([0x10, 0x27, 0x80, 0x3e], 26);
		expect(imageSize(vp8, 'image/webp')).toEqual({ width: 10000, height: 16000 });
		// VP8L (lossless): 14-bit width-1 and height-1 packed from byte 21.
		const vp8l = riff('VP8L', []);
		const bits = (1000 - 1) | ((500 - 1) << 14);
		vp8l.set([bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff], 21);
		expect(imageSize(vp8l, 'image/webp')).toEqual({ width: 1000, height: 500 });
	});

	it('gives up on anything else', () => {
		expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')).toBeNull();
		expect(imageSize(fixture('123x45.png'), 'image/heic')).toBeNull();
	});
});
