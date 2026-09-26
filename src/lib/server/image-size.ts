// Width and height of an image, read from its first bytes without decoding it. Used to turn
// away images that are small as a file but huge once decoded (e.g. a 20000 × 20000 PNG).

export type Size = { width: number; height: number };

function jpegSize(b: Uint8Array): Size | null {
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) return null;
		const marker = b[i + 1];
		// Padding and markers without a length.
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2;
			continue;
		}
		const length = (b[i + 2] << 8) | b[i + 3];
		// Start-of-frame markers (C0–CF except DHT C4, JPG C8, DAC CC) hold the size.
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
		}
		i += 2 + length;
	}
	return null;
}

const u32be = (b: Uint8Array, i: number) =>
	((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function webpSize(b: Uint8Array): Size | null {
	const chunk = String.fromCharCode(...b.subarray(12, 16));
	if (chunk === 'VP8 ' && b.length >= 30) {
		return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
	}
	if (chunk === 'VP8L' && b.length >= 25) {
		const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
		return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	if (chunk === 'VP8X' && b.length >= 30) {
		return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
	}
	return null;
}

/** The size of a JPEG, PNG, GIF or WebP image, or null if it can't be read. */
export function imageSize(bytes: Uint8Array, mimeType: string): Size | null {
	switch (mimeType) {
		case 'image/png':
			return bytes.length >= 24 ? { width: u32be(bytes, 16), height: u32be(bytes, 20) } : null;
		case 'image/gif':
			return bytes.length >= 10 ? { width: u16le(bytes, 6), height: u16le(bytes, 8) } : null;
		case 'image/jpeg':
			return jpegSize(bytes);
		case 'image/webp':
			return webpSize(bytes);
		default:
			return null;
	}
}
