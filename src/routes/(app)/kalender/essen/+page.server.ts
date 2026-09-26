import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isDate } from '$lib/server/calendar';
import { getFamilyState } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import {
	addMealsToList,
	deleteMeal,
	isMealSlot,
	listDishes,
	listMeals,
	saveMeal
} from '$lib/server/meals';
import { field } from '$lib/server/validation';
import { addDays, today } from '$lib/dates';
import { holidaysBetween } from '$lib/holidays';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { family } = requireFamily(locals);
	const now = today();
	const param = url.searchParams.get('woche') ?? '';
	// Without a chosen week the plan starts today, so nobody scrolls past days that are over.
	const start = isDate(param) ? param : now;
	const end = addDays(start, 6);
	return {
		today: now,
		start,
		days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
		meals: await listMeals(db, family.id, start, end),
		dishes: await listDishes(db, family.id),
		holidays: holidaysBetween(start, end, await getFamilyState(db, family.id))
	};
};

function plural(n: number, one: string, many: string) {
	return `${n} ${n === 1 ? one : many}`;
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const date = field(form, 'date');
		const slot = field(form, 'slot');
		const name = field(form, 'name');
		const ingredients = field(form, 'ingredients');
		if (!isDate(date) || !isMealSlot(slot)) return fail(400, { message: 'Unbekannter Tag.' });
		if (!name) return fail(400, { message: 'Was gibt es zu essen?' });
		if (name.length > 100 || ingredients.length > 2000) {
			return fail(400, { message: 'Der Eintrag ist zu lang.' });
		}
		await saveMeal(db, family.id, user.id, { date, slot, name, ingredients });
	},

	delete: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		await deleteMeal(db, family.id, field(await request.formData(), 'id'));
	},

	toList: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const ids = (await request.formData()).getAll('id').filter((v) => typeof v === 'string');
		const added = await addMealsToList(db, family.id, user.id, ids);
		return {
			listMessage: added
				? `${plural(added, 'Zutat', 'Zutaten')} auf die Einkaufsliste gesetzt.`
				: 'Alles steht schon auf der Einkaufsliste.'
		};
	}
};
