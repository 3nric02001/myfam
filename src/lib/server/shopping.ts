import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { shoppingHistory, shoppingItem, user } from './db/schema';

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
	await remember(db, familyId, row.name);
	return row;
}

const historyKey = (name: string) => name.trim().toLowerCase();

/** Counts the entry in the family's history; the latest spelling wins. */
async function remember(db: DB, familyId: string, name: string) {
	const now = new Date();
	await db
		.insert(shoppingHistory)
		.values({ familyId, key: historyKey(name), name, uses: 1, lastUsedAt: now })
		.onConflictDoUpdate({
			target: [shoppingHistory.familyId, shoppingHistory.key],
			set: { name, uses: sql`${shoppingHistory.uses} + 1`, lastUsedAt: now }
		});
}

/** What the family has bought before, most often and most recently first. */
export async function listHistory(db: DB, familyId: string, limit = 200) {
	const rows = await db
		.select({ key: shoppingHistory.key, name: shoppingHistory.name, uses: shoppingHistory.uses })
		.from(shoppingHistory)
		.where(eq(shoppingHistory.familyId, familyId))
		.orderBy(desc(shoppingHistory.uses), desc(shoppingHistory.lastUsedAt))
		.limit(limit);
	// Rows copied from old list entries may differ only in the case of umlauts.
	const seen = new Set<string>();
	return rows.filter((r) => {
		const key = historyKey(r.name);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export async function forgetHistory(db: DB, familyId: string, key: string) {
	await db
		.delete(shoppingHistory)
		.where(and(eq(shoppingHistory.familyId, familyId), eq(shoppingHistory.key, key)));
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
