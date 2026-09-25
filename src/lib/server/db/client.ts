import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'node:path';
import * as schema from './schema';

export type DB = ReturnType<typeof createDb>;

/** Opens the SQLite database and applies all pending migrations. */
export function createDb(url: string, migrationsFolder = path.resolve('drizzle')) {
	const client = new Database(url);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	const db = drizzle(client, { schema });
	migrate(db, { migrationsFolder });
	return db;
}
