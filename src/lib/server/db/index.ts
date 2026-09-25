import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { createDb, type DB } from './client';

function open(): DB {
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	return createDb(env.DATABASE_URL);
}

// The build analyses server modules without a database, so only open it at runtime.
export const db = building ? (undefined as unknown as DB) : open();
