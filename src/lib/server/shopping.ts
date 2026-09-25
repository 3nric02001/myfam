import { and, asc, desc, eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { shoppingItem, user } from './db/schema';

// Every query is scoped to a family, so one family can never see or change another's items.

export async function listItems(db: DB, familyId: string) {
	return db
		.select({
			id: shoppingItem.id,
			name: shoppingItem.name,
			quantity: shoppingItem.quantity,
			done: shoppingItem.done,
			createdBy: user.name
		})
		.from(shoppingItem)
		.leftJoin(user, eq(shoppingItem.createdBy, user.id))
		.where(eq(shoppingItem.familyId, familyId))
		.orderBy(asc(shoppingItem.done), desc(shoppingItem.createdAt), asc(shoppingItem.name));
}

export async function addItem(
	db: DB,
	familyId: string,
	createdBy: string,
	input: { name: string; quantity?: string | null }
) {
	const [row] = await db
		.insert(shoppingItem)
		.values({
			familyId,
			createdBy,
			name: input.name.trim(),
			quantity: input.quantity?.trim() || null
		})
		.returning();
	return row;
}

export async function setDone(db: DB, familyId: string, id: string, done: boolean) {
	await db
		.update(shoppingItem)
		.set({ done })
		.where(and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.id, id)));
}

export async function deleteItem(db: DB, familyId: string, id: string) {
	await db
		.delete(shoppingItem)
		.where(and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.id, id)));
}

export async function clearDone(db: DB, familyId: string) {
	await db
		.delete(shoppingItem)
		.where(and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.done, true)));
}
