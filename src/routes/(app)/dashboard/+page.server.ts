import { db } from '$lib/server/db';
import { listEvents } from '$lib/server/calendar';
import { getFamilyState } from '$lib/server/families';
import { requireViewer } from '$lib/server/guards';
import { listUnseen, markAllSeen, markCardSeen } from '$lib/server/planning';
import { listSubscriptionEvents } from '$lib/server/subscriptions';
import { listTasks } from '$lib/server/tasks';
import { listItems } from '$lib/server/shopping';
import { listMeals } from '$lib/server/meals';
import { getPlan } from '$lib/server/plan';
import { getOfferSettings } from '$lib/server/offers';
import { listSubscriptions } from '$lib/server/push';
import { listMemberColors } from '$lib/server/families';
import { field } from '$lib/server/validation';
import { isWeekDone } from '$lib/server/week';
import { holidaysBetween } from '$lib/holidays';
import { nextWeek, weekdayOf } from '$lib/week';
import { addDays, today } from '$lib/dates';
import type { Actions, PageServerLoad } from './$types';

/** How far ahead "Demnächst" looks for my tasks. */
const TASK_DAYS = 7;

export const load: PageServerLoad = async ({ locals }) => {
	const { user, family, viewer } = requireViewer(locals);
	const now = today();
	const tomorrow = addDays(now, 1);

	// Today's and tomorrow's events, own ones and those from subscribed calendars.
	const own = (await listEvents(db, family.id, user.id, now, tomorrow)).map((e) => ({
		id: e.id,
		key: e.key,
		createdById: e.createdById as string | null,
		repeat: e.repeat as string | null,
		title: e.title,
		startDate: e.startDate,
		startTime: e.startTime,
		endDate: e.endDate,
		endTime: e.endTime,
		visibility: e.visibility,
		href: `/kalender/${e.id}`,
		source: null as string | null,
		color: null as string | null
	}));
	const subscribed = (await listSubscriptionEvents(db, family.id, now, tomorrow)).map((e) => ({
		id: e.id,
		key: e.id,
		createdById: null,
		repeat: null,
		title: e.title,
		startDate: e.startDate,
		startTime: e.startTime,
		endDate: e.endDate,
		endTime: e.endTime,
		visibility: 'family' as const,
		href: `/kalender/abos/termin/${e.id}`,
		source: e.source as string | null,
		color: e.color as string | null
	}));
	const sortKey = (e: (typeof own)[number]) =>
		`${e.startTime ? `1${e.startTime}` : '0'} ${e.title}`;
	const events = [...own, ...subscribed].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

	const { open } = await listTasks(db, family.id, user.id, { mine: true, doneLimit: 0 });
	const until = addDays(now, TASK_DAYS);

	const items = await listItems(db, family.id);
	const plan = await getPlan(db, family.id, now);
	// First steps for a new family; the dashboard hides them once everything is done.
	const setup = {
		invited: (await listMemberColors(db, family.id)).length > 1,
		push: (await listSubscriptions(db, user.id)).length > 0,
		stores: (await getOfferSettings(db, family.id)).stores.length > 0
	};

	// From Saturday to Monday the dashboard invites to plan the (coming) week, until someone did.
	const week = nextWeek(now);
	const weekPlanDue =
		[5, 6, 0].includes(weekdayOf(now)) && !(await isWeekDone(db, family.id, week));

	return {
		today: now,
		weekPlan: weekPlanDue ? week : null,
		userName: user.name,
		shopping: { open: items.filter((i) => !i.done).length, planned: plan?.date ?? null },
		meals: await listMeals(db, family.id, now, now),
		setup,
		tomorrow,
		events,
		holidays: holidaysBetween(now, tomorrow, await getFamilyState(db, family.id)),
		tasks: open.filter((t) => t.dueDate <= until),
		laterTasks: open.filter((t) => t.dueDate > until).length,
		planning: await listUnseen(db, viewer)
	};
};

export const actions: Actions = {
	/** Hides one card from the list without opening it. */
	seen: async ({ request, locals }) => {
		const { viewer } = requireViewer(locals);
		await markCardSeen(db, viewer, field(await request.formData(), 'id'));
	},
	allSeen: async ({ locals }) => {
		const { viewer } = requireViewer(locals);
		await markAllSeen(db, viewer);
	}
};
