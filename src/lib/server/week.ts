import { and, eq, gt, gte, lt, or } from 'drizzle-orm';
import type { DB } from './db/client';
import { meal, weekPlan, type MealSlot } from './db/schema';
import { addDays } from '$lib/dates';
import { mealSlots } from '$lib/meals';
import { weekdayOf, type PastMeal } from '$lib/week';

// The weekly planning on Sunday. Like the meal plan it belongs to the whole family: whoever
// finishes it, finishes it for everyone.

/** How far back earlier dishes are suggested from. */
const HISTORY_DAYS = 365;

/**
 * The family's meals of the last year and everything planned ahead, except the week being
 * planned, for suggestions. Dishes planned for later weeks count too, so a new dish is in the
 * pool as soon as someone enters it.
 */
export async function otherMeals(db: DB, familyId: string, week: string): Promise<PastMeal[]> {
	return db
		.select({ date: meal.date, slot: meal.slot, name: meal.name, ingredients: meal.ingredients })
		.from(meal)
		.where(
			and(
				eq(meal.familyId, familyId),
				gte(meal.date, addDays(week, -HISTORY_DAYS)),
				or(lt(meal.date, week), gt(meal.date, addDays(week, 6)))
			)
		);
}

/**
 * The meals the family plans, per weekday (Monday first), judged by the four weeks before
 * `monday` and the week itself: a meal counts on the weekdays it was planned on, or on every day
 * once it was planned on three different weekdays (a roast on Sundays doesn't ask for lunch all
 * week). Dinner for a family that hasn't planned anything yet.
 */
export function usedSlots(meals: { date: string; slot: MealSlot }[], monday: string) {
	const from = addDays(monday, -28);
	const to = addDays(monday, 6);
	const recent = meals.filter((m) => m.date >= from && m.date <= to);
	const days = new Map<MealSlot, Set<number>>();
	for (const m of recent) days.set(m.slot, (days.get(m.slot) ?? new Set()).add(weekdayOf(m.date)));
	const perDay = Array.from({ length: 7 }, (_, weekday) =>
		mealSlots.filter((slot) => {
			const on = days.get(slot);
			return on && (on.size >= 3 || on.has(weekday));
		})
	);
	return perDay.every((slots) => !slots.length) ? perDay.map(() => ['dinner' as MealSlot]) : perDay;
}

export async function isWeekDone(db: DB, familyId: string, week: string) {
	const [row] = await db
		.select()
		.from(weekPlan)
		.where(and(eq(weekPlan.familyId, familyId), eq(weekPlan.week, week)));
	return row ?? null;
}

export async function markWeekDone(db: DB, familyId: string, week: string, userId: string) {
	const values = { doneBy: userId, doneAt: new Date() };
	await db
		.insert(weekPlan)
		.values({ familyId, week, ...values })
		.onConflictDoUpdate({ target: [weekPlan.familyId, weekPlan.week], set: values });
}
