import type { MealSlot } from '$lib/server/db/schema';

export const mealSlots: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export const mealSlotLabel: Record<MealSlot, string> = {
	breakfast: 'Frühstück',
	lunch: 'Mittag',
	dinner: 'Abend'
};

export type PlannedMeal = {
	id: string;
	date: string;
	slot: MealSlot;
	name: string;
	ingredients: string | null;
	addedToList: boolean;
};

export type Dish = { name: string; ingredients: string | null };
