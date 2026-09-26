import { db } from '$lib/server/db';
import { listEvents } from '$lib/server/calendar';
import { getFamilyState } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import { holidaysBetween, STATES } from '$lib/holidays';
import { isMonth, monthGrid, today } from '$lib/dates';
import { isDate } from '$lib/server/calendar';
import { listDishes, listMeals } from '$lib/server/meals';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, family } = requireFamily(locals);
	const now = today();
	const day = url.searchParams.get('tag') ?? '';
	const monthParam = url.searchParams.get('monat') ?? '';
	const month = isMonth(monthParam) ? monthParam : isDate(day) ? day.slice(0, 7) : now.slice(0, 7);
	const selected =
		isDate(day) && day.startsWith(month) ? day : now.startsWith(month) ? now : `${month}-01`;

	const days = monthGrid(month);
	const from = days[0];
	const to = days[days.length - 1];
	const state = await getFamilyState(db, family.id);
	return {
		month,
		today: now,
		selected,
		days,
		events: await listEvents(db, family.id, user.id, from, to),
		meals: await listMeals(db, family.id, from, to),
		dishes: await listDishes(db, family.id),
		holidays: holidaysBetween(from, to, state),
		stateName: state ? STATES[state] : null
	};
};
