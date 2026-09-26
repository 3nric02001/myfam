import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { family, shoppingCategory, shoppingHistory, shoppingItem, user } from './db/schema';
import { categoryKey, guessCategory, isCategory, type CategoryId } from '$lib/categories';

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

/** Changes name and quantity of an entry; a new name also goes into the history. */
export async function updateItem(
	db: DB,
	familyId: string,
	id: string,
	input: { name: string; quantity?: string | null }
) {
	const where = and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.id, id));
	const [before] = await db.select({ name: shoppingItem.name }).from(shoppingItem).where(where);
	if (!before) return null;
	const [row] = await db
		.update(shoppingItem)
		.set({ name: input.name.trim(), quantity: input.quantity?.trim() || null })
		.where(where)
		.returning();
	if (historyKey(row.name) !== historyKey(before.name)) await remember(db, familyId, row.name);
	return row;
}

export async function setDone(db: DB, familyId: string, id: string, done: boolean) {
	await db
		.update(shoppingItem)
		.set({ done })
		.where(and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.id, id)));
}

/** Deletes an entry and returns it, so it can be put back with restoreItem(). */
export async function deleteItem(db: DB, familyId: string, id: string) {
	const [row] = await db
		.delete(shoppingItem)
		.where(and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.id, id)))
		.returning();
	return row ?? null;
}

/** Puts a deleted entry back as it was ("Rückgängig"), without counting it in the history again. */
export async function restoreItem(
	db: DB,
	familyId: string,
	createdBy: string,
	input: { name: string; quantity?: string | null; done: boolean }
) {
	const [row] = await db
		.insert(shoppingItem)
		.values({
			familyId,
			createdBy,
			name: input.name.trim(),
			quantity: input.quantity?.trim() || null,
			done: input.done
		})
		.returning();
	return row;
}

/** The family's order of sections, as walked through their store; null is the default order. */
export async function getCategoryOrder(db: DB, familyId: string): Promise<string[] | null> {
	const [row] = await db
		.select({ order: family.categoryOrder })
		.from(family)
		.where(eq(family.id, familyId));
	try {
		const order = row?.order ? JSON.parse(row.order) : null;
		return Array.isArray(order)
			? order.filter((id) => typeof id === 'string' && isCategory(id))
			: null;
	} catch {
		return null;
	}
}

export async function setCategoryOrder(db: DB, familyId: string, order: CategoryId[] | null) {
	await db
		.update(family)
		.set({ categoryOrder: order ? JSON.stringify(order) : null })
		.where(eq(family.id, familyId));
}

export async function clearDone(db: DB, familyId: string) {
	await db
		.delete(shoppingItem)
		.where(and(eq(shoppingItem.familyId, familyId), eq(shoppingItem.done, true)));
}

/** The family's corrected sections, by categoryKey(). */
async function categoryRules(db: DB, familyId: string) {
	const rows = await db
		.select({ key: shoppingCategory.key, category: shoppingCategory.category })
		.from(shoppingCategory)
		.where(eq(shoppingCategory.familyId, familyId));
	return new Map(rows.map((r) => [r.key, r.category as CategoryId]));
}

/** The list with each entry's section: the family's correction if there is one, else a guess. */
export async function listItemsWithCategory(db: DB, familyId: string) {
	const [items, rules] = await Promise.all([listItems(db, familyId), categoryRules(db, familyId)]);
	return items.map((item) => {
		const category = rules.get(categoryKey(item.name));
		return {
			...item,
			category: category && isCategory(category) ? category : guessCategory(item.name)
		};
	});
}

/** Remembers the section for this entry, so it lands there every time it is added again. */
export async function setCategory(db: DB, familyId: string, name: string, category: CategoryId) {
	const key = categoryKey(name);
	if (!key) return;
	if (category === guessCategory(name)) {
		// Matches the guess anyway; no need to keep a correction around.
		await db
			.delete(shoppingCategory)
			.where(and(eq(shoppingCategory.familyId, familyId), eq(shoppingCategory.key, key)));
		return;
	}
	await db
		.insert(shoppingCategory)
		.values({ familyId, key, category })
		.onConflictDoUpdate({
			target: [shoppingCategory.familyId, shoppingCategory.key],
			set: { category }
		});
}
