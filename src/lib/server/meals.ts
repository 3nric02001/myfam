import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { dishIdea, meal, type MealSlot } from './db/schema';
import { addItem, listItems } from './shopping';

// The meal plan belongs to the whole family: everyone sees and edits it.
// Every query is scoped to a family, so one family can never see or change another's plan.

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export function isMealSlot(value: string): value is MealSlot {
	return (MEAL_SLOTS as string[]).includes(value);
}

export async function listMeals(db: DB, familyId: string, from: string, to: string) {
	const rows = await db
		.select({
			id: meal.id,
			date: meal.date,
			slot: meal.slot,
			name: meal.name,
			ingredients: meal.ingredients,
			addedToList: meal.addedToList
		})
		.from(meal)
		.where(and(eq(meal.familyId, familyId), gte(meal.date, from), lte(meal.date, to)))
		.orderBy(asc(meal.date));
	return rows.sort(
		(a, b) =>
			a.date.localeCompare(b.date) || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot)
	);
}

/**
 * Dishes the family has planned before, most often and most recently first, with the
 * ingredients they were last planned with, so picking one fills the ingredients in.
 */
export async function listDishes(db: DB, familyId: string, limit = 100) {
	const rows = await db
		.select({
			name: meal.name,
			uses: sql<number>`count(*)`,
			last: sql<string>`max(${meal.date})`
		})
		.from(meal)
		.where(eq(meal.familyId, familyId))
		.groupBy(sql`lower(${meal.name})`)
		.orderBy(desc(sql`count(*)`), desc(sql`max(${meal.date})`))
		.limit(limit);
	if (rows.length === 0) {
		return (await listIdeas(db, familyId)).map(({ name, ingredients }) => ({ name, ingredients }));
	}
	const latest = await db
		.select({ name: meal.name, ingredients: meal.ingredients, date: meal.date })
		.from(meal)
		.where(
			and(
				eq(meal.familyId, familyId),
				inArray(
					sql`lower(${meal.name})`,
					rows.map((r) => r.name.toLowerCase())
				)
			)
		)
		.orderBy(desc(meal.date));
	const ingredientsOf = new Map<string, string | null>();
	for (const r of latest) {
		const key = r.name.toLowerCase();
		// Newest first; keep the newest plan that had ingredients.
		if (!ingredientsOf.get(key) && r.ingredients) ingredientsOf.set(key, r.ingredients);
	}
	const dishes = rows.map((r) => ({
		name: r.name,
		ingredients: ingredientsOf.get(r.name.toLowerCase()) ?? null
	}));
	// Ideas that were never planned come last.
	const known = new Set(dishes.map((d) => d.name.toLowerCase()));
	const ideas = (await listIdeas(db, familyId)).filter((i) => !known.has(i.name.toLowerCase()));
	return [...dishes, ...ideas.map(({ name, ingredients }) => ({ name, ingredients }))];
}

export type MealInput = { date: string; slot: MealSlot; name: string; ingredients?: string | null };

/** Tidies the ingredient list: one per line (', ' also separates), no empty lines or bullets. */
export function cleanIngredients(text: string | null | undefined) {
	const lines = (text ?? '')
		.split(/\r?\n|,\s+/)
		.map((l) => l.replace(/^[\s\-•*]+/, '').trim())
		.filter(Boolean);
	return lines.length ? lines.join('\n') : null;
}

/** Plans a dish for a day and meal, replacing whatever was planned there. */
export async function saveMeal(db: DB, familyId: string, createdBy: string, input: MealInput) {
	const name = input.name.trim();
	const ingredients = cleanIngredients(input.ingredients);
	const [existing] = await db
		.select()
		.from(meal)
		.where(and(eq(meal.familyId, familyId), eq(meal.date, input.date), eq(meal.slot, input.slot)));
	if (existing) {
		// A changed ingredient list may need to go on the shopping list again.
		const changed = existing.name !== name || existing.ingredients !== ingredients;
		await db
			.update(meal)
			.set({ name, ingredients, addedToList: changed ? false : existing.addedToList })
			.where(eq(meal.id, existing.id));
		return;
	}
	await db
		.insert(meal)
		.values({ familyId, createdBy, date: input.date, slot: input.slot, name, ingredients });
}

export async function deleteMeal(db: DB, familyId: string, id: string) {
	await db.delete(meal).where(and(eq(meal.familyId, familyId), eq(meal.id, id)));
}

const UNITS =
	'g|kg|mg|ml|cl|dl|l|el|tl|stk|stück|st|x|pck|pkg|packung|packungen|dose|dosen|bund|becher|glas|gläser|prise|zehe|zehen|scheibe|scheiben|flasche|flaschen|beutel|tüte|netz|kopf|köpfe';
const QUANTITY = new RegExp(
	`^((?:ca\\.?\\s*)?\\d+(?:[.,/]\\d+)?(?:\\s*-\\s*\\d+(?:[.,]\\d+)?)?\\s*(?:(?:${UNITS})\\.?(?=\\s))?|½|¼|¾|ein(?:e|en)?|zwei|drei)\\s+(.+)$`,
	'i'
);

/** Splits '500 g Nudeln' into quantity and name, so the list shows 'Nudeln · 500 g'. */
export function parseIngredient(line: string) {
	const match = QUANTITY.exec(line.trim());
	if (!match) return { name: line.trim(), quantity: null };
	return { name: match[2].trim(), quantity: match[1].trim() };
}

/**
 * Puts the ingredients of the given meals on the shopping list, skipping what is already on it
 * (unchecked), and marks the meals. Returns how many entries were added.
 */
export async function addMealsToList(db: DB, familyId: string, userId: string, ids: string[]) {
	if (ids.length === 0) return 0;
	const meals = await db
		.select()
		.from(meal)
		.where(and(eq(meal.familyId, familyId), inArray(meal.id, ids)));
	const onList = new Set(
		(await listItems(db, familyId)).filter((i) => !i.done).map((i) => i.name.toLowerCase())
	);
	let added = 0;
	for (const m of meals) {
		for (const line of (m.ingredients ?? '').split('\n').filter(Boolean)) {
			const item = parseIngredient(line);
			if (!item.name || onList.has(item.name.toLowerCase())) continue;
			await addItem(db, familyId, userId, {
				name: item.name.slice(0, 100),
				quantity: item.quantity?.slice(0, 30)
			});
			onList.add(item.name.toLowerCase());
			added++;
		}
	}
	await db
		.update(meal)
		.set({ addedToList: true })
		.where(and(eq(meal.familyId, familyId), inArray(meal.id, ids)));
	return added;
}

/** The family's list of dish ideas, by name. */
export async function listIdeas(db: DB, familyId: string) {
	return db
		.select({ id: dishIdea.id, name: dishIdea.name, ingredients: dishIdea.ingredients })
		.from(dishIdea)
		.where(eq(dishIdea.familyId, familyId))
		.orderBy(sql`${dishIdea.name} collate nocase`);
}

/**
 * Keeps a dish in mind without planning it. The same name (ignoring case) is stored once; adding
 * it again updates the ingredients. Returns false for an empty name.
 */
export async function saveIdea(
	db: DB,
	familyId: string,
	createdBy: string,
	input: { name: string; ingredients?: string | null }
) {
	const name = input.name.trim();
	if (!name) return false;
	const ingredients = cleanIngredients(input.ingredients);
	const [existing] = await db
		.select()
		.from(dishIdea)
		.where(
			and(eq(dishIdea.familyId, familyId), sql`lower(${dishIdea.name}) = ${name.toLowerCase()}`)
		);
	if (existing) {
		if (ingredients) {
			await db.update(dishIdea).set({ ingredients }).where(eq(dishIdea.id, existing.id));
		}
		return true;
	}
	await db.insert(dishIdea).values({ familyId, createdBy, name, ingredients });
	return true;
}

export async function deleteIdea(db: DB, familyId: string, id: string) {
	await db.delete(dishIdea).where(and(eq(dishIdea.familyId, familyId), eq(dishIdea.id, id)));
}
