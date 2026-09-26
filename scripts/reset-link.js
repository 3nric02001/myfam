// Creates a link to set a new password, for when nobody who could create one in the app can
// sign in (e.g. the only admin forgot the password). Run inside the container:
//   docker compose exec app node scripts/reset-link.js anna@example.de
import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
	console.error('Aufruf: node scripts/reset-link.js <E-Mail-Adresse>');
	process.exit(1);
}

const db = new Database(process.env.DATABASE_URL ?? 'myfam.db');
const user = db.prepare('select id, name from user where email = ?').get(email);
if (!user) {
	console.error(`Zu ${email} gibt es kein Konto.`);
	process.exit(1);
}

const token = randomBytes(32).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600;
db.prepare('delete from password_reset where user_id = ?').run(user.id);
db.prepare(
	'insert into password_reset (id, user_id, created_by, expires_at) values (?, ?, null, ?)'
).run(createHash('sha256').update(token).digest('hex'), user.id, expiresAt);

const origin = (process.env.ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
console.log(`Link für ${user.name} (24 Stunden gültig):\n${origin}/passwort/${token}`);
