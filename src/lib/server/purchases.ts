import { and, asc, count, desc, eq, gte } from 'drizzle-orm';
import type { DB } from './db/client';
import { purchase, purchaseLine, user } from './db/schema';
import { purchaseTotal, type PurchaseLine, type PurchaseSummary } from '$lib/purchases';

// Every query is scoped to a family, like the shopping list itself.

/** Saves a shopping trip with its lines. Returns null when there is nothing to save. */
export async function savePurchase(
	db: DB,
	familyId: string,
	createdBy: string,
	input: { store: string; date: string; lines: PurchaseLine[] }
) {
	if (!input.lines.length) return null;
	return db.transaction((tx) => {
		const row = tx
			.insert(purchase)
			.values({
				familyId,
				createdBy,
				store: input.store,
				date: input.date,
				total: purchaseTotal(input.lines)
			})
			.returning()
			.get();
		tx.insert(purchaseLine)
			.values(input.lines.map((l, position) => ({ ...l, purchaseId: row.id, position })))
			.run();
		return row;
	});
}

/** Trips newest first, optionally only from a day on. */
export async function listPurchases(
	db: DB,
	familyId: string,
	options: { from?: string; limit?: number } = {}
): Promise<PurchaseSummary[]> {
	const query = db
		.select({
			id: purchase.id,
			store: purchase.store,
			date: purchase.date,
			total: purchase.total,
			lines: count(purchaseLine.id),
			createdBy: user.name
		})
		.from(purchase)
		.leftJoin(purchaseLine, eq(purchaseLine.purchaseId, purchase.id))
		.leftJoin(user, eq(purchase.createdBy, user.id))
		.where(
			and(
				eq(purchase.familyId, familyId),
				options.from ? gte(purchase.date, options.from) : undefined
			)
		)
		.groupBy(purchase.id)
		.orderBy(desc(purchase.date), desc(purchase.createdAt));
	return options.limit ? query.limit(options.limit) : query;
}

export async function getPurchase(db: DB, familyId: string, id: string) {
	const [row] = await db
		.select({
			id: purchase.id,
			store: purchase.store,
			date: purchase.date,
			total: purchase.total,
			createdBy: user.name
		})
		.from(purchase)
		.leftJoin(user, eq(purchase.createdBy, user.id))
		.where(and(eq(purchase.familyId, familyId), eq(purchase.id, id)));
	if (!row) return null;
	const lines = await db
		.select({
			id: purchaseLine.id,
			name: purchaseLine.name,
			product: purchaseLine.product,
			price: purchaseLine.price,
			count: purchaseLine.count,
			weighed: purchaseLine.weighed
		})
		.from(purchaseLine)
		.where(eq(purchaseLine.purchaseId, id))
		.orderBy(asc(purchaseLine.position));
	return { ...row, lines };
}

export async function deletePurchase(db: DB, familyId: string, id: string) {
	await db.delete(purchase).where(and(eq(purchase.familyId, familyId), eq(purchase.id, id)));
}
