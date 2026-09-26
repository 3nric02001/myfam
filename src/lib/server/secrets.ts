import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Encrypts passwords of calendar subscriptions, so a copy of the database alone does not reveal
// them. The key comes from SECRET_KEY, or else from a file created next to the database.

const PREFIX = 'v1:';

/** A 32-byte key from any text, or from a key file that is created on first use. */
export function loadKey(secret: string | undefined, databaseUrl: string): Buffer {
	if (secret) return createHash('sha256').update(secret).digest();
	const file = path.join(path.dirname(path.resolve(databaseUrl)), 'secret.key');
	if (!existsSync(file)) {
		try {
			writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
		} catch (e) {
			// Another process created it in the meantime.
			if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
		}
	}
	return createHash('sha256').update(readFileSync(file, 'utf8').trim()).digest();
}

export function encrypt(key: Buffer, plain: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

/** Returns null if the value was encrypted with another key. */
export function decrypt(key: Buffer, value: string): string | null {
	if (!value.startsWith(PREFIX)) return null;
	try {
		const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
		const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
		decipher.setAuthTag(raw.subarray(12, 28));
		return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}
