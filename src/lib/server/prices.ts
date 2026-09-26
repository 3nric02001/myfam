import { and, desc, eq, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { knownPrice, user } from './db/schema';
import { categoryKey } from '$lib/categories';
import type { KnownPrice } from '$lib/prices';

// Every query is scoped to a family, like the shopping list itself.

export async function listKnownPrices(db: DB, familyId: string): Promise<KnownPrice[]> {
	return db
		.select({
			id: knownPrice.id,
			key: knownPrice.key,
			store: knownPrice.store,
			product: knownPrice.product,
			price: knownPrice.price,
			seenOn: knownPrice.seenOn,
			createdBy: user.name
		})
		.from(knownPrice)
		.leftJoin(user, eq(knownPrice.createdBy, user.id))
		.where(eq(knownPrice.familyId, familyId))
		.orderBy(knownPrice.key, desc(knownPrice.seenOn));
}

/**
 * Remembers what a product costs at a store. A newer price for the same entry, store and
 * product replaces the old one.
 */
export async function recordPrice(
	db: DB,
	familyId: string,
	createdBy: string,
	input: { name: string; store: string; product?: string; price: number; seenOn: string }
) {
	const key = categoryKey(input.name);
	const product = input.product?.trim() || input.name.trim();
	if (!key) return null;
	await db
		.delete(knownPrice)
		.where(
			and(
				eq(knownPrice.familyId, familyId),
				eq(knownPrice.key, key),
				eq(knownPrice.store, input.store),
				sql`lower(${knownPrice.product}) = lower(${product})`
			)
		);
	const [row] = await db
		.insert(knownPrice)
		.values({
			familyId,
			key,
			store: input.store,
			product,
			price: input.price,
			seenOn: input.seenOn,
			createdBy
		})
		.returning();
	return row;
}

export async function deleteKnownPrice(db: DB, familyId: string, id: string) {
	await db.delete(knownPrice).where(and(eq(knownPrice.familyId, familyId), eq(knownPrice.id, id)));
}
