import type { MealSlot } from '$lib/server/db/schema';
import { addDays, weekStart } from '$lib/dates';

// The weekly planning on Sunday: which week it is about and which earlier dishes to suggest.

/** The steps of the weekly planning, in order. */
export const weekSteps = ['termine', 'aufgaben', 'essen', 'einkauf'] as const;
export type WeekStep = (typeof weekSteps)[number];

export function isWeekStep(value: string): value is WeekStep {
	return (weekSteps as readonly string[]).includes(value);
}

/**
 * The week being planned: the coming one from Tuesday to Sunday, the current one on Monday
 * (when Sunday's planning slipped).
 */
export function nextWeek(today: string) {
	const weekday = weekdayOf(today);
	return weekday === 0 ? today : addDays(today, 7 - weekday);
}

/** Monday = 0. */
export function weekdayOf(date: string) {
	return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const WEEKDAY_NAMES = [
	'Montag',
	'Dienstag',
	'Mittwoch',
	'Donnerstag',
	'Freitag',
	'Samstag',
	'Sonntag'
];

/** One dish the family planned before (or ahead), with how and when they planned it. */
export type DishStats = {
	name: string;
	ingredients: string | null;
	/** How often it was planned. */
	count: number;
	/** The first and the last day it was planned. */
	first: string;
	last: string;
	/** How often per weekday, Monday first. */
	weekdays: number[];
	/** How often per meal. */
	slots: Partial<Record<MealSlot, number>>;
};

/** Meals of a family outside the planned week, one row per planned dish. */
export type PastMeal = { date: string; slot: MealSlot; name: string; ingredients: string | null };

/** Groups earlier meals by dish (ignoring case), newest spelling and ingredients win. */
export function dishStats(meals: PastMeal[]): DishStats[] {
	const byKey = new Map<string, DishStats>();
	for (const m of [...meals].sort((a, b) => b.date.localeCompare(a.date))) {
		const key = m.name.trim().toLowerCase();
		if (!key) continue;
		let dish = byKey.get(key);
		if (!dish) {
			dish = {
				name: m.name.trim(),
				ingredients: null,
				count: 0,
				first: m.date,
				last: m.date,
				weekdays: [0, 0, 0, 0, 0, 0, 0],
				slots: {}
			};
			byKey.set(key, dish);
		}
		dish.count++;
		dish.first = m.date;
		dish.weekdays[weekdayOf(m.date)]++;
		dish.slots[m.slot] = (dish.slots[m.slot] ?? 0) + 1;
		if (!dish.ingredients && m.ingredients) dish.ingredients = m.ingredients;
	}
	return [...byKey.values()];
}

/** "Was gibt es am Montag zum Abendessen?" */
export const mealQuestion: Record<MealSlot, string> = {
	breakfast: 'zum Frühstück',
	lunch: 'zu Mittag',
	dinner: 'zum Abendessen'
};

export type Suggestion = {
	name: string;
	ingredients: string | null;
	/** Why it is suggested, e.g. "Oft am Freitag" or "Lange nicht gegessen". */
	reason: string;
};

function weeksBetween(from: string, to: string) {
	const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
	return Math.floor(days / 7);
}

/** A dish first planned this many days before the planned week (or later) counts as new. */
const NEW_DAYS = 21;

/**
 * Earlier dishes for one meal of the planned week, best first. Dishes already planned for this
 * week, and those eaten last week, are left out, unless the family has them on that weekday
 * regularly (pizza on Fridays). What they often have on that weekday comes first, then dishes
 * that are new in the family's kitchen, then favourites they haven't had for a while, then the
 * rest.
 */
export function suggestDishes(
	dishes: DishStats[],
	date: string,
	slot: MealSlot,
	opts: { planned?: string[]; limit?: number } = {}
): Suggestion[] {
	const weekday = weekdayOf(date);
	const monday = addDays(date, -weekday);
	const planned = new Set((opts.planned ?? []).map((n) => n.trim().toLowerCase()));
	// Only dishes of this meal, unless the family never planned it before.
	const forSlot = dishes.filter((d) => d.slots[slot]);
	const pool = forSlot.length ? forSlot : dishes;
	const scored = pool
		.filter((d) => !planned.has(d.name.toLowerCase()))
		.map((d) => {
			const onDay = d.weekdays[weekday];
			const habit = onDay >= 2 && onDay / d.count >= 0.4;
			const isNew = d.count <= 2 && d.first >= addDays(monday, -NEW_DAYS);
			const weeks = weeksBetween(weekStart(d.last), monday);
			let reason: string;
			let score = Math.log2(1 + d.count);
			if (habit) {
				reason = `Oft am ${WEEKDAY_NAMES[weekday]}`;
				score += 4 + onDay;
			} else if (isNew) {
				// Just tried, or entered for a later week: worth keeping in mind.
				reason = d.first >= monday ? 'Neu · schon vorgemerkt' : 'Neu dazugekommen';
				score += 4;
			} else if (weeks < 2) {
				// Eaten last week, or already planned for a later week.
				return null;
			} else if (d.count >= 2 && weeks >= 4) {
				reason = `Lange nicht gegessen · vor ${weeks} Wochen`;
				score += 2 + Math.min(weeks, 12) / 4;
			} else if (d.count >= 3) {
				reason = `Beliebt · ${d.count}-mal gekocht`;
				score += 1;
			} else {
				reason = weeks === 2 ? 'Vorletzte Woche' : `Vor ${weeks} Wochen`;
			}
			return { name: d.name, ingredients: d.ingredients, reason, score, last: d.last };
		})
		.filter((s) => s !== null)
		.sort((a, b) => b.score - a.score || b.last.localeCompare(a.last));
	return scored
		.slice(0, opts.limit ?? 6)
		.map(({ name, ingredients, reason }) => ({ name, ingredients, reason }));
}
