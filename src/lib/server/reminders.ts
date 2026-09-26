import { and, eq, gte, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { DB } from './db/client';
import { calendarEvent, calendarEventShare, membership, reminderSent, task } from './db/schema';
import { sendToUsers, type PushMessage, type Sender } from './push';
import { addDays, dayLabel, today } from '$lib/dates';
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

export const sources: ReminderSource[] = [eventReminders, taskReminders];

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
			await sendToUsers(db, reminder.userIds, reminder.message, send);
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
