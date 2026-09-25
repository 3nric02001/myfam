const MAX_SIDE = 2000;

/**
 * Shrinks large photos in the browser before upload, so phone pictures stay small and
 * upload quickly. Also drops embedded metadata such as the GPS location.
 * Returns the original file if it is already small or cannot be decoded.
 */
export async function shrinkImage(file: File): Promise<File> {
	if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
		if (scale === 1 && file.size < 1_500_000 && file.type !== 'image/heic') return file;
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.85)
		);
		if (!blob || blob.size >= file.size) return file;
		return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
	} catch {
		return file;
	}
}
