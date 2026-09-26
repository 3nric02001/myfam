// Text recognition for receipt photos, on this server with tesseract.js and the German model
// from @tesseract.js-data/deu. Photos never leave the server and are not stored.

import { createRequire } from 'node:module';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);

function langPath() {
	const pkg = require.resolve('@tesseract.js-data/deu/package.json');
	return path.join(path.dirname(pkg), '4.0.0_best_int');
}

/** Reads the text of an image. One worker per photo: receipts are rare, memory is not. */
export async function readText(image: Buffer) {
	const worker = await createWorker('deu', 1, { langPath: langPath(), cacheMethod: 'none' });
	try {
		const { data } = await worker.recognize(image, { rotateAuto: true });
		return data.text;
	} finally {
		await worker.terminate();
	}
}
