import { db } from '$lib/server/db';
import { listEvents } from '$lib/server/calendar';
import { getFamilyState } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import { listSubscriptionEvents } from '$lib/server/subscriptions';
import { holidaysBetween, STATES } from '$lib/holidays';
import { isMonth, monthGrid, today } from '$lib/dates';
import { isDate } from '$lib/server/calendar';
import { listDishes, listMeals } from '$lib/server/meals';
import { listOverdue, listTasksDue } from '$lib/server/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, family } = requireFamily(locals);
	const now = today();
	const day = url.searchParams.get('tag') ?? '';
	const monthParam = url.searchParams.get('monat') ?? '';
	const month = isMonth(monthParam) ? monthParam : isDate(day) ? day.slice(0, 7) : now.slice(0, 7);
	const selected =
		isDate(day) && day.startsWith(month) ? day : now.startsWith(month) ? now : `${month}-01`;

	// The week of the selected day is shown; the whole month only when expanded.
	const expanded = url.searchParams.get('ansicht') === 'monat';
	const days = monthGrid(month);
	const from = days[0];
	const to = days[days.length - 1];
	const state = await getFamilyState(db, family.id);
	const own = (await listEvents(db, family.id, user.id, from, to)).map((e) => ({
		...e,
		href: `/kalender/${e.id}`,
		source: null,
		color: null
	}));
	// Events from subscribed calendars: every member sees them, with the subscription as source.
	const subscribed = (await listSubscriptionEvents(db, family.id, from, to)).map((e) => ({
		...e,
		visibility: 'family' as const,
		createdById: null,
		createdBy: null,
		key: e.id,
		href: `/kalender/abos/termin/${e.id}`
	}));
	const sortKey = (e: (typeof own)[number] | (typeof subscribed)[number]) =>
		`${e.startDate} ${e.startTime ? `1${e.startTime}` : '0'} ${e.title}`;
	const events = [...own, ...subscribed].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
	return {
		month,
		today: now,
		selected,
		expanded,
		days,
		events,
		meals: await listMeals(db, family.id, from, to),
		tasks: await listTasksDue(db, family.id, user.id, from, to),
		overdue: await listOverdue(db, family.id, user.id, now),
		dishes: await listDishes(db, family.id),
		holidays: holidaysBetween(from, to, state),
		stateName: state ? STATES[state] : null
	};
};
