import { createDb } from '../db/client';
import { createUser } from '../auth';
import { createFamily } from '../families';

export function testDb() {
	return createDb(':memory:');
}

export async function seedFamily(db: ReturnType<typeof testDb>, prefix: string) {
	const owner = await createUser(db, {
		email: `${prefix}@example.com`,
		name: prefix,
		password: 'geheim-passwort'
	});
	const fam = await createFamily(db, `Familie ${prefix}`, owner.id);
	return { owner, family: fam };
}
