import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { checkEvent, createEvent, isDate } from '$lib/server/calendar';
import { getFamilyState, listMembers } from '$lib/server/families';
import { requireFamily } from '$lib/server/guards';
import {
	addMealsToList,
	deleteIdea,
	deleteMeal,
	isMealSlot,
	listIdeas,
	listMeals,
	saveIdea,
	saveMeal
} from '$lib/server/meals';
import { cancelPlan, getPlan, isTripDay, planTrip, tipFor, tripText } from '$lib/server/plan';
import { listItems } from '$lib/server/shopping';
import { listSubscriptionEvents } from '$lib/server/subscriptions';
import {
	checkTask,
	createTask,
	listOverdue,
	listTasksDue,
	memberIds,
	notifyAssignee
} from '$lib/server/tasks';
import { appSender } from '$lib/server/app-sender';
import { listEvents } from '$lib/server/calendar';
import { field } from '$lib/server/validation';
import { isWeekDone, markWeekDone, otherMeals, usedSlots } from '$lib/server/week';
import { addDays, today, weekStart } from '$lib/dates';
import { holidaysBetween } from '$lib/holidays';
import { dishStats, isWeekStep, nextWeek, type WeekStep } from '$lib/week';
import type { Actions, PageServerLoad } from './$types';

/** The week of the form, or the coming one. */
function weekOf(value: string) {
	return isDate(value) ? weekStart(value) : nextWeek(today());
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, family } = requireFamily(locals);
	const now = today();
	const week = weekOf(url.searchParams.get('woche') ?? '');
	const end = addDays(week, 6);
	const param = url.searchParams.get('schritt') ?? '';
	const step: WeekStep | 'fertig' | null = isWeekStep(param) || param === 'fertig' ? param : null;

	const events = [
		...(await listEvents(db, family.id, user.id, week, end)).map((e) => ({
			key: e.key,
			title: e.title,
			startDate: e.startDate,
			startTime: e.startTime,
			endDate: e.endDate,
			personId: e.createdById as string | null,
			source: null as string | null,
			href: `/kalender/${e.id}`
		})),
		...(await listSubscriptionEvents(db, family.id, week, end)).map((e) => ({
			key: e.id,
			title: e.title,
			startDate: e.startDate,
			startTime: e.startTime,
			endDate: e.endDate,
			personId: null,
			source: e.source as string | null,
			href: `/kalender/abos/termin/${e.id}`
		}))
	].sort((a, b) =>
		`${a.startTime ? `1${a.startTime}` : '0'} ${a.title}`.localeCompare(
			`${b.startTime ? `1${b.startTime}` : '0'} ${b.title}`
		)
	);

	const history = await otherMeals(db, family.id, week);
	const ideas = await listIdeas(db, family.id);
	const meals = await listMeals(db, family.id, week, end);
	const items = (await listItems(db, family.id)).filter((i) => !i.done);
	const done = await isWeekDone(db, family.id, week);
	const members = await listMembers(db, family.id);

	return {
		today: now,
		week,
		step,
		days: Array.from({ length: 7 }, (_, i) => addDays(week, i)),
		holidays: holidaysBetween(week, end, await getFamilyState(db, family.id)),
		events,
		tasks: await listTasksDue(db, family.id, user.id, week, end),
		// Everything still open from before, so it can be moved into the new week or ticked off.
		overdue: await listOverdue(db, family.id, user.id, week),
		members: members.map(({ id, name }) => ({ id, name })),
		meals,
		slots: usedSlots([...history, ...meals], week),
		ideas,
		// Ideas always, and the dishes planned most often.
		dishes: dishStats(history, ideas)
			.sort(
				(a, b) =>
					Number(b.idea) - Number(a.idea) || b.count - a.count || b.last.localeCompare(a.last)
			)
			.slice(0, 200 + ideas.length),
		shopping: { open: items.length, plan: (await getPlan(db, family.id, now))?.date ?? null },
		done: done
			? {
					by: members.find((m) => m.id === done.doneBy)?.name ?? null,
					at: done.doneAt
				}
			: null
	};
};

function plural(n: number, one: string, many: string) {
	return `${n} ${n === 1 ? one : many}`;
}

export const actions: Actions = {
	/** A quick event for the whole family: title, day and an optional start time. */
	event: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const date = field(form, 'date');
		const result = checkEvent({
			title: field(form, 'title'),
			startDate: date,
			startTime: field(form, 'time') || null,
			endDate: date,
			visibility: 'family'
		});
		if ('error' in result) return fail(400, { step: 'termine', message: result.error });
		await createEvent(db, family.id, user.id, result.event);
		return { step: 'termine', added: result.event.title };
	},

	/** A quick task for the family, optionally for one member. */
	task: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const ids = await memberIds(db, family.id);
		const result = checkTask(
			{
				title: field(form, 'title'),
				notes: null,
				dueDate: field(form, 'date'),
				assigneeId: field(form, 'assigneeId') || null,
				visibility: 'family',
				shareWith: []
			},
			user.id,
			ids
		);
		if ('error' in result) return fail(400, { step: 'aufgaben', message: result.error });
		const task = await createTask(db, family.id, user.id, result.task);
		notifyAssignee(db, appSender(), task, user).catch((err) =>
			console.error('Push zur neuen Aufgabe fehlgeschlagen:', err)
		);
		return { step: 'aufgaben', added: task.title };
	},

	meal: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const date = field(form, 'date');
		const slot = field(form, 'slot');
		const name = field(form, 'name');
		const ingredients = field(form, 'ingredients');
		if (!isDate(date) || !isMealSlot(slot)) {
			return fail(400, { step: 'essen', message: 'Unbekannter Tag.' });
		}
		if (!name) return fail(400, { step: 'essen', message: 'Was gibt es zu essen?' });
		if (name.length > 100 || ingredients.length > 2000) {
			return fail(400, { step: 'essen', message: 'Der Eintrag ist zu lang.' });
		}
		await saveMeal(db, family.id, user.id, { date, slot, name, ingredients });
		return { step: 'essen' };
	},

	/** Puts a dish on the family's list of ideas, without planning it. */
	idea: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const form = await request.formData();
		const name = field(form, 'name');
		const ingredients = field(form, 'ingredients');
		if (name.length > 100 || ingredients.length > 2000) {
			return fail(400, { step: 'essen', message: 'Der Eintrag ist zu lang.' });
		}
		if (!(await saveIdea(db, family.id, user.id, { name, ingredients }))) {
			return fail(400, { step: 'essen', message: 'Welches Gericht?' });
		}
		return { step: 'essen', idea: name };
	},

	deleteIdea: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		await deleteIdea(db, family.id, field(await request.formData(), 'id'));
		return { step: 'essen' };
	},

	deleteMeal: async ({ request, locals }) => {
		const { family } = requireFamily(locals);
		await deleteMeal(db, family.id, field(await request.formData(), 'id'));
		return { step: 'essen' };
	},

	toList: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const ids = (await request.formData()).getAll('id').filter((v) => typeof v === 'string');
		const added = await addMealsToList(db, family.id, user.id, ids);
		return {
			step: 'einkauf',
			listMessage: added
				? `${plural(added, 'Zutat', 'Zutaten')} auf die Einkaufsliste gesetzt.`
				: 'Alles steht schon auf der Einkaufsliste.'
		};
	},

	shop: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const date = field(await request.formData(), 'date');
		const day = today();
		if (!isTripDay(date, day)) {
			return fail(400, { step: 'einkauf', message: 'Bitte wähle einen Tag ab heute.' });
		}
		const tip = await tipFor(db, family.id, date, day);
		await planTrip(db, family.id, user.id, { date, ...tripText(tip) });
		return { step: 'einkauf' };
	},

	unshop: async ({ locals }) => {
		const { family } = requireFamily(locals);
		await cancelPlan(db, family.id);
		return { step: 'einkauf' };
	},

	/** Finishes the planning for the whole family, so nobody is reminded about it again. */
	done: async ({ request, locals }) => {
		const { user, family } = requireFamily(locals);
		const week = weekOf(field(await request.formData(), 'week'));
		await markWeekDone(db, family.id, week, user.id);
		redirect(303, `/woche?woche=${week}&schritt=fertig`);
	}
};
