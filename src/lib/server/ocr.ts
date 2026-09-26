// Text recognition for receipt photos, on this server with tesseract.js and the German model
// from @tesseract.js-data/deu. Photos never leave the server and are not stored.

import { createRequire } from 'node:module';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { imageSize } from './image-size';
import { sniffImageType } from './uploads';

const require = createRequire(import.meta.url);

/** Larger photos would need too much memory once decoded. Phone cameras take 12–48 MP. */
export const MAX_PIXELS = 50_000_000;
/** Photos waiting beyond this are turned away instead of piling up in memory. */
export const MAX_WAITING = 3;

export class OcrError extends Error {}

function langPath() {
	const pkg = require.resolve('@tesseract.js-data/deu/package.json');
	return path.join(path.dirname(pkg), '4.0.0_best_int');
}

/** Checks that the bytes are a photo small enough to read. Returns an error message or null. */
export function checkPhoto(bytes: Uint8Array) {
	const type = sniffImageType(bytes);
	if (!type) return 'Das Foto muss ein JPEG, PNG, WebP oder GIF sein.';
	const size = imageSize(bytes, type);
	if (!size || !size.width || !size.height) return 'Das Foto konnte nicht gelesen werden.';
	if (size.width * size.height > MAX_PIXELS) return 'Das Foto hat zu viele Pixel.';
	return null;
}

/** Runs jobs one after another, so several photos at once can't exhaust the memory. */
export class Queue {
	private tail: Promise<unknown> = Promise.resolve();
	private pending = 0;

	constructor(private maxWaiting: number) {}

	run<T>(job: () => Promise<T>): Promise<T> {
		// The job that is running counts too.
		if (this.pending > this.maxWaiting) {
			return Promise.reject(new OcrError('Gerade werden andere Kassenzettel gelesen.'));
		}
		this.pending++;
		const result = this.tail.then(job).finally(() => this.pending--);
		this.tail = result.catch(() => {});
		return result;
	}
}

const queue = new Queue(MAX_WAITING);

/** Reads the text of an image, one image at a time. */
export async function readText(image: Buffer) {
	const problem = checkPhoto(image);
	if (problem) throw new OcrError(problem);
	return queue.run(async () => {
		const worker = await createWorker('deu', 1, { langPath: langPath(), cacheMethod: 'none' });
		try {
			const { data } = await worker.recognize(image, { rotateAuto: true });
			return data.text;
		} finally {
			await worker.terminate();
		}
	});
}
