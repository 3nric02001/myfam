import { and, eq, gte, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { DB } from './db/client';
import {
	calendarEvent,
	calendarEventShare,
	meal,
	membership,
	reminderSent,
	shoppingTrip,
	task,
	type MealSlot,
	type NotificationKind
} from './db/schema';
import { sendToUsers, type PushMessage, type Sender } from './push';
import { addDays, dayLabel, today, weekStart } from '$lib/dates';
import { mealSlotLabel, mealSlots } from '$lib/meals';
import { listEvents } from './calendar';
import { listMeals } from './meals';
import { listSubscriptionEvents } from './subscriptions';
import { listTasks } from './tasks';
import { occurrences } from '$lib/repeat';

// Push reminders. Each source lists what is due around `now` together with the users who may
// see it; the scheduler sends each reminder once. New kinds of reminders (e.g. tasks) only need
// another source.

export type DueReminder = {
	/** Unique per item and due time, so it is sent once, and again after the item moved. */
	key: string;
	/** When the reminder was due. */
	at: Date;
	userIds: string[];
	message: PushMessage;
	/** Users who switched this kind off in the settings don't get it. */
	kind: NotificationKind;
};

export type ReminderSource = (db: DB, now: Date) => Promise<DueReminder[]>;

/** Reminders that were due up to this long ago are still sent, e.g. after a restart. */
export const GRACE_MS = 30 * 60_000;

const TIME_ZONE = 'Europe/Berlin';

/** The instant of a German local date and time. */
export function berlinTime(date: string, time = '00:00') {
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi] = time.split(':').map(Number);
	const asUtc = Date.UTC(y, mo - 1, d, h, mi);
	// Correct by the offset at that moment; the second pass settles days with a DST switch.
	let instant = asUtc - offset(asUtc);
	instant = asUtc - offset(instant);
	return new Date(instant);
}

const parts = new Intl.DateTimeFormat('en-US', {
	timeZone: TIME_ZONE,
	hourCycle: 'h23',
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric'
});

/** Milliseconds Berlin is ahead of UTC at the given instant. */
function offset(instant: number) {
	const p = Object.fromEntries(
		parts.formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)])
	);
	return (
		Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000
	);
}

/** "Heute um 14:30 Uhr", "Morgen, ganztägig", "Samstag, 3. Oktober um 9:00 Uhr". */
export function whenLabel(date: string, time: string | null, now: Date) {
	const day = today(now);
	const name =
		date === day
			? 'Heute'
			: date === addDays(day, 1)
				? 'Morgen'
				: date === addDays(day, 2)
					? 'Übermorgen'
					: dayLabel(date);
	return time ? `${name} um ${time} Uhr` : `${name}, ganztägig`;
}

/** Calendar events whose reminder is due, for everyone who may see the event. */
export const eventReminders: ReminderSource = async (db, now) => {
	const day = today(now);
	// Reminders are at most two days before the start or eight hours after midnight.
	const from = addDays(day, -1);
	const to = addDays(day, 3);
	const rows = await db
		.select()
		.from(calendarEvent)
		.where(
			and(
				isNotNull(calendarEvent.reminder),
				lte(calendarEvent.startDate, to),
				or(
					gte(calendarEvent.startDate, from),
					and(
						isNotNull(calendarEvent.repeat),
						or(isNull(calendarEvent.repeatUntil), gte(calendarEvent.repeatUntil, from))
					)
				)
			)
		);
	// Repeating events remind before each occurrence.
	const events = rows.flatMap((event) =>
		event.repeat
			? occurrences(event.startDate, event.repeat, event.repeatUntil, 0, from, to).map(
					(startDate) => ({ ...event, startDate })
				)
			: [event]
	);
	const due: DueReminder[] = [];
	for (const event of events) {
		const start = berlinTime(event.startDate, event.startTime ?? '00:00');
		const at = new Date(start.getTime() - event.reminder! * 60_000);
		if (at > now || now.getTime() - at.getTime() > GRACE_MS) continue;
		// A reminder that was already due when the event was entered would only be noise.
		if (at < event.createdAt) continue;

		const members = await db
			.select({ userId: membership.userId })
			.from(membership)
			.where(eq(membership.familyId, event.familyId));
		const memberIds = new Set(members.map((m) => m.userId));
		let userIds: string[];
		if (event.visibility === 'family') userIds = [...memberIds];
		else {
			const shares =
				event.visibility === 'shared'
					? await db
							.select({ userId: calendarEventShare.userId })
							.from(calendarEventShare)
							.where(eq(calendarEventShare.eventId, event.id))
					: [];
			userIds = [event.createdBy, ...shares.map((s) => s.userId)].filter(
				(id): id is string => !!id && memberIds.has(id)
			);
		}

		due.push({
			key: `event:${event.id}:${at.toISOString()}`,
			at,
			kind: 'event',
			userIds,
			message: {
				title: event.title,
				body: whenLabel(event.startDate, event.startTime, now),
				url: `/kalender/${event.id}`,
				tag: `event:${event.id}`
			}
		});
	}
	return due;
};

/** Open tasks are reminded at this time on the day they are due. */
export const TASK_REMINDER_TIME = '08:00';

/**
 * Open tasks due today, in the morning: to the person they are assigned to, or to whoever
 * created them when nobody is, so an unassigned task doesn't ping the whole family.
 */
export const taskReminders: ReminderSource = async (db, now) => {
	const day = today(now);
	const tasks = await db
		.select()
		.from(task)
		.where(and(isNull(task.doneAt), gte(task.dueDate, addDays(day, -1)), lte(task.dueDate, day)));
	const due: DueReminder[] = [];
	for (const t of tasks) {
		const at = berlinTime(t.dueDate, TASK_REMINDER_TIME);
		if (at > now || now.getTime() - at.getTime() > GRACE_MS) continue;
		if (at < t.createdAt) continue;
		const to = t.assigneeId ?? t.createdBy;
		if (!to) continue;
		const [member] = await db
			.select({ userId: membership.userId })
			.from(membership)
			.where(and(eq(membership.familyId, t.familyId), eq(membership.userId, to)));
		if (!member) continue;
		due.push({
			key: `task:${t.id}:${t.dueDate}`,
			at,
			kind: 'task',
			userIds: [to],
			message: {
				title: `Heute fällig: ${t.title}`,
				body: t.assigneeId ? 'Diese Aufgabe ist dir zugewiesen.' : 'Deine Aufgabe von der Liste.',
				url: `/kalender/aufgaben/${t.id}`,
				tag: `task:${t.id}`
			}
		});
	}
	return due;
};

/** Everyone in a family, once per family they belong to. */
async function memberships(db: DB) {
	return db.select({ userId: membership.userId, familyId: membership.familyId }).from(membership);
}

/** Open tasks of the user (assigned to them, or unassigned and created by them) due by `day`. */
async function myOpenTasks(db: DB, familyId: string, userId: string, day: string) {
	const { open } = await listTasks(db, familyId, userId, { mine: true, doneLimit: 0 });
	return open.filter((t) => t.dueDate <= day);
}

/** "Müll, Einkaufen und 2 weitere". */
export function listLabel(names: string[], max = 3) {
	if (names.length <= max) return names.join(', ');
	return `${names.slice(0, max).join(', ')} und ${names.length - max} weitere`;
}

/** The morning overview is sent at this time. */
export const MORNING_TIME = '07:00';

/**
 * Every morning, for each member: today's events they may see, their open tasks and the
 * meals planned for today. Nothing is sent on a day without any of these.
 */
export const morningOverview: ReminderSource = async (db, now) => {
	const day = today(now);
	const at = berlinTime(day, MORNING_TIME);
	if (at > now || now.getTime() - at.getTime() > GRACE_MS) return [];
	const due: DueReminder[] = [];
	const mealsOf = new Map<string, Awaited<ReturnType<typeof listMeals>>>();
	for (const { userId, familyId } of await memberships(db)) {
		if (!mealsOf.has(familyId)) mealsOf.set(familyId, await listMeals(db, familyId, day, day));
		const meals = mealsOf.get(familyId)!;
		const events = [
			...(await listEvents(db, familyId, userId, day, day)),
			...(await listSubscriptionEvents(db, familyId, day, day))
		]
			.map((e) => (e.startTime && e.startDate === day ? `${e.startTime} ${e.title}` : e.title))
			// All-day events first, then by time.
			.sort((a, b) => (/^\d/.test(a) ? 1 : 0) - (/^\d/.test(b) ? 1 : 0) || a.localeCompare(b));
		const tasks = await myOpenTasks(db, familyId, userId, day);
		if (!events.length && !tasks.length && !meals.length) continue;
		const lines = [
			events.length ? `Termine: ${listLabel(events)}` : null,
			tasks.length ? `Aufgaben: ${listLabel(tasks.map((t) => t.title))}` : null,
			meals.length
				? `Essen: ${meals.map((m) => `${m.name} (${mealSlotLabel[m.slot]})`).join(', ')}`
				: null
		].filter(Boolean);
		due.push({
			key: `morning:${familyId}:${userId}:${day}`,
			at,
			kind: 'morning',
			userIds: [userId],
			message: {
				title: `Heute, ${dayLabel(day)}`,
				body: lines.join('\n'),
				url: '/dashboard',
				tag: `morning:${familyId}`
			}
		});
	}
	return due;
};

/** Tasks still open for today are mentioned at this time in the evening. */
export const EVENING_TIME = '20:00';

/** In the evening, to each member whose tasks for today (or earlier) are still open. */
export const eveningTasks: ReminderSource = async (db, now) => {
	const day = today(now);
	const at = berlinTime(day, EVENING_TIME);
	if (at > now || now.getTime() - at.getTime() > GRACE_MS) return [];
	const due: DueReminder[] = [];
	for (const { userId, familyId } of await memberships(db)) {
		const tasks = await myOpenTasks(db, familyId, userId, day);
		if (!tasks.length) continue;
		due.push({
			key: `evening:${familyId}:${userId}:${day}`,
			at,
			kind: 'evening',
			userIds: [userId],
			message: {
				title:
					tasks.length === 1 ? 'Noch eine Aufgabe offen' : `Noch ${tasks.length} Aufgaben offen`,
				body: listLabel(tasks.map((t) => t.title)),
				url: '/kalender/aufgaben',
				tag: `evening:${familyId}`
			}
		});
	}
	return due;
};

/** On Sundays at this time the family hears about meals still open for the coming week. */
export const MEAL_REMINDER_TIME = '18:00';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** "Mo, Mi Abend, Fr Mittag + Abend": whole days by name, otherwise the open meals. */
export function openMealsLabel(open: { day: number; slots: MealSlot[] }[], used: MealSlot[]) {
	return open
		.map(({ day, slots }) =>
			slots.length === used.length
				? WEEKDAYS[day]
				: `${WEEKDAYS[day]} ${slots.map((slot) => mealSlotLabel[slot]).join(' + ')}`
		)
		.join(', ');
}

/**
 * Sunday evening: meals of the coming week that are still open, to the whole family. Only the
 * meals the family plans at all count (e.g. no breakfast if they never plan one), judged by the
 * last four weeks; a family that doesn't use the meal plan hears nothing.
 */
export const mealReminders: ReminderSource = async (db, now) => {
	const day = today(now);
	// Sunday, or Monday just after midnight while the grace period of Sunday evening lasts.
	const sunday = weekStart(day) === day ? addDays(day, -1) : addDays(weekStart(day), 6);
	const at = berlinTime(sunday, MEAL_REMINDER_TIME);
	if (at > now || now.getTime() - at.getTime() > GRACE_MS) return [];
	const monday = addDays(sunday, 1);
	const rows = await db
		.select({ familyId: meal.familyId, date: meal.date, slot: meal.slot })
		.from(meal)
		.where(and(gte(meal.date, addDays(sunday, -27)), lte(meal.date, addDays(monday, 6))));
	const byFamily = new Map<string, { date: string; slot: MealSlot }[]>();
	for (const row of rows) {
		byFamily.set(row.familyId, [...(byFamily.get(row.familyId) ?? []), row]);
	}
	const due: DueReminder[] = [];
	for (const [familyId, meals] of byFamily) {
		const used = mealSlots.filter((slot) => meals.some((m) => m.slot === slot));
		const planned = new Set(meals.map((m) => `${m.date}:${m.slot}`));
		const open = Array.from({ length: 7 }, (_, i) => ({
			day: i,
			slots: used.filter((slot) => !planned.has(`${addDays(monday, i)}:${slot}`))
		})).filter((d) => d.slots.length > 0);
		const count = open.reduce((sum, d) => sum + d.slots.length, 0);
		if (count === 0) continue;
		const members = await db
			.select({ userId: membership.userId })
			.from(membership)
			.where(eq(membership.familyId, familyId));
		due.push({
			key: `meals:${familyId}:${monday}`,
			at,
			kind: 'meals',
			userIds: members.map((m) => m.userId),
			message: {
				title: 'Essensplan für nächste Woche',
				body: `Noch ${count === 1 ? 'eine Mahlzeit' : `${count} Mahlzeiten`} offen: ${openMealsLabel(open, used)}.`,
				url: `/kalender/essen?woche=${monday}`,
				tag: `meals:${monday}`
			}
		});
	}
	return due;
};

/** This long after the last item was ticked off, the shopping counts as done. */
export const RECEIPT_DELAY_MS = 5 * 60_000;

/**
 * A few minutes after someone stopped ticking off items, and no receipt was saved since they
 * started: a nudge to that person to photograph the receipt.
 */
export const receiptReminders: ReminderSource = async (db, now) => {
	// Trips that are long over are not needed any more.
	await db
		.delete(shoppingTrip)
		.where(lte(shoppingTrip.lastCheckAt, new Date(now.getTime() - 86_400_000)));
	const trips = await db
		.select()
		.from(shoppingTrip)
		.where(
			and(
				gte(shoppingTrip.checks, 1),
				lte(shoppingTrip.lastCheckAt, new Date(now.getTime() - RECEIPT_DELAY_MS)),
				gte(shoppingTrip.lastCheckAt, new Date(now.getTime() - RECEIPT_DELAY_MS - GRACE_MS))
			)
		);
	return trips.map((trip) => ({
		// One reminder per trip, even if more items are ticked off afterwards.
		key: `receipt:${trip.familyId}:${trip.userId}:${trip.startedAt.toISOString()}`,
		at: new Date(trip.lastCheckAt.getTime() + RECEIPT_DELAY_MS),
		kind: 'receipt' as const,
		userIds: [trip.userId],
		message: {
			title: 'Kassenzettel fotografieren?',
			body:
				trip.checks === 1
					? 'Du hast etwas abgehakt. Mit einem Foto vom Bon lernt MyFam die Preise.'
					: `Du hast ${trip.checks} Sachen abgehakt. Mit einem Foto vom Bon lernt MyFam die Preise.`,
			url: '/einkauf/kassenzettel',
			tag: `receipt:${trip.familyId}`
		}
	}));
};

export const sources: ReminderSource[] = [
	morningOverview,
	eventReminders,
	taskReminders,
	eveningTasks,
	mealReminders,
	receiptReminders
];

/** Sends every due reminder that was not sent yet. Returns the keys it sent. */
export async function sendDueReminders(
	db: DB,
	now: Date,
	send: Sender,
	from: ReminderSource[] = sources
) {
	const sent: string[] = [];
	for (const source of from) {
		for (const reminder of await source(db, now)) {
			// Claim the reminder first, so two overlapping runs never both send it.
			const claimed = db
				.insert(reminderSent)
				.values({ key: reminder.key, sentAt: now })
				.onConflictDoNothing()
				.run();
			if (claimed.changes === 0) continue;
			await sendToUsers(db, reminder.userIds, reminder.message, send, reminder.kind);
			sent.push(reminder.key);
		}
	}
	// Keys are only needed while their reminder could still be due.
	await db
		.delete(reminderSent)
		.where(lte(reminderSent.sentAt, new Date(now.getTime() - 7 * 86_400_000)));
	return sent;
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Checks for due reminders every minute, inside the app process. */
export function startReminderScheduler(db: DB, send: Sender) {
	if (timer) return;
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			await sendDueReminders(db, new Date(), send);
		} catch (err) {
			console.error('Erinnerungen konnten nicht verschickt werden:', err);
		} finally {
			running = false;
		}
	};
	void tick();
	timer = setInterval(tick, 60_000);
	timer.unref();
}
