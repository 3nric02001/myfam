import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { DB } from './db/client';
import {
	membership,
	task,
	taskShare,
	user,
	type Repeat,
	type Role,
	type Visibility
} from './db/schema';
import { isDate } from './calendar';
import { visibleTo } from './visibility';
import { sendToUsers, type Sender } from './push';
import { addDays, dayLabel, today } from '$lib/dates';
import { isRepeat, nextDate } from '$lib/repeat';

// To-dos with a due day and an optional assignee. Every query is scoped to a family and to what
// the viewer may see, with the same family / shared / private model as calendar events.

export type TaskInput = {
	title: string;
	notes: string | null;
	dueDate: string;
	assigneeId: string | null;
	visibility: Visibility;
	shareWith: string[];
	repeat?: Repeat | null;
};

type Viewer = { id: string; role: Role };

const seeable = (viewerId: string) =>
	visibleTo(viewerId, task, {
		table: taskShare,
		itemId: taskShare.taskId,
		userId: taskShare.userId
	});

/**
 * Checks a task. The assignee has to be a member and has to be able to see the task, so a
 * shared task is also shared with its assignee and a private one can only be assigned to oneself.
 */
export function checkTask(
	input: TaskInput,
	creatorId: string,
	memberIds: string[]
): { error: string } | { task: TaskInput } {
	const title = input.title.trim();
	if (!title) return { error: 'Was ist zu tun?' };
	if (title.length > 100) return { error: 'Der Titel ist zu lang (max. 100 Zeichen).' };
	const notes = input.notes?.trim() || null;
	if (notes && notes.length > 1000) return { error: 'Die Notiz ist zu lang (max. 1000 Zeichen).' };
	if (!isDate(input.dueDate)) return { error: 'Bitte gib ein gültiges Fälligkeitsdatum an.' };
	const assigneeId = input.assigneeId || null;
	if (assigneeId && !memberIds.includes(assigneeId)) return { error: 'Unbekanntes Mitglied.' };
	const repeat = input.repeat || null;
	if (repeat !== null && !isRepeat(repeat))
		return { error: 'Bitte wähle eine gültige Wiederholung.' };
	let shareWith = input.shareWith;
	if (assigneeId && assigneeId !== creatorId) {
		if (input.visibility === 'private') {
			return { error: 'Eine private Aufgabe kannst du nur dir selbst zuweisen.' };
		}
		if (input.visibility === 'shared' && !shareWith.includes(assigneeId)) {
			shareWith = [...shareWith, assigneeId];
		}
	}
	return { task: { ...input, title, notes, assigneeId, shareWith, repeat } };
}

export function taskFromForm(form: FormData) {
	const text = (name: string) => {
		const v = form.get(name);
		return typeof v === 'string' ? v.trim() : '';
	};
	return {
		title: text('title'),
		notes: text('notes'),
		dueDate: text('dueDate'),
		assigneeId: text('assigneeId') || null,
		repeat: (text('repeat') || null) as Repeat | null
	};
}

const assignee = alias(user, 'assignee');

function selectTasks(db: DB) {
	return db
		.select({
			id: task.id,
			title: task.title,
			notes: task.notes,
			dueDate: task.dueDate,
			assigneeId: task.assigneeId,
			assignee: assignee.name,
			visibility: task.visibility,
			repeat: task.repeat,
			done: isNotNull(task.doneAt).mapWith(Boolean),
			createdById: task.createdBy
		})
		.from(task)
		.leftJoin(assignee, eq(task.assigneeId, assignee.id));
}

/** Tasks due in a date range (inclusive), for the calendar. */
export async function listTasksDue(
	db: DB,
	familyId: string,
	viewerId: string,
	from: string,
	to: string
) {
	return selectTasks(db)
		.where(
			and(
				eq(task.familyId, familyId),
				gte(task.dueDate, from),
				lte(task.dueDate, to),
				seeable(viewerId)
			)
		)
		.orderBy(asc(task.dueDate), asc(task.createdAt));
}

/** Open tasks due before the given day. */
export async function listOverdue(db: DB, familyId: string, viewerId: string, before: string) {
	return selectTasks(db)
		.where(
			and(
				eq(task.familyId, familyId),
				isNull(task.doneAt),
				lt(task.dueDate, before),
				seeable(viewerId)
			)
		)
		.orderBy(asc(task.dueDate), asc(task.createdAt));
}

/**
 * All open tasks plus the most recently finished ones, for the to-do list.
 * With `mine`, only tasks assigned to the viewer, plus unassigned ones they created.
 */
export async function listTasks(
	db: DB,
	familyId: string,
	viewerId: string,
	opts: { mine?: boolean; doneLimit?: number } = {}
) {
	const mine = opts.mine
		? or(eq(task.assigneeId, viewerId), and(isNull(task.assigneeId), eq(task.createdBy, viewerId)))
		: undefined;
	const open = await selectTasks(db)
		.where(and(eq(task.familyId, familyId), isNull(task.doneAt), seeable(viewerId), mine))
		.orderBy(asc(task.dueDate), asc(task.createdAt));
	const done = await selectTasks(db)
		.where(and(eq(task.familyId, familyId), isNotNull(task.doneAt), seeable(viewerId), mine))
		.orderBy(desc(task.doneAt))
		.limit(opts.doneLimit ?? 20);
	return { open, done };
}

export async function getTask(db: DB, familyId: string, viewerId: string, id: string) {
	const [row] = await db
		.select()
		.from(task)
		.where(and(eq(task.familyId, familyId), eq(task.id, id), seeable(viewerId)));
	if (!row) return null;
	const shares = await db
		.select({ userId: taskShare.userId })
		.from(taskShare)
		.where(eq(taskShare.taskId, id));
	return { ...row, sharedWith: shares.map((s) => s.userId) };
}

/** Same rule as calendar events: the creator, and admins for tasks the whole family sees. */
export function canEditTask(
	t: { createdBy: string | null; visibility: Visibility },
	viewer: Viewer
) {
	return t.createdBy === viewer.id || (viewer.role === 'admin' && t.visibility === 'family');
}

export async function memberIds(db: DB, familyId: string) {
	const rows = await db
		.select({ id: membership.userId })
		.from(membership)
		.where(eq(membership.familyId, familyId));
	return rows.map((r) => r.id);
}

export async function createTask(db: DB, familyId: string, createdBy: string, input: TaskInput) {
	const { shareWith, ...values } = input;
	return db.transaction((tx) => {
		const row = tx
			.insert(task)
			.values({ ...values, familyId, createdBy })
			.returning()
			.get();
		const shares = shareWith.filter((id) => id !== createdBy);
		if (input.visibility === 'shared' && shares.length) {
			tx.insert(taskShare)
				.values(shares.map((userId) => ({ taskId: row.id, userId })))
				.run();
		}
		return row;
	});
}

export async function updateTask(
	db: DB,
	familyId: string,
	viewer: Viewer,
	id: string,
	input: TaskInput
) {
	const existing = await getTask(db, familyId, viewer.id, id);
	if (!existing || !canEditTask(existing, viewer)) return false;
	// Only the creator may change who sees a task.
	if (existing.createdBy !== viewer.id && input.visibility !== existing.visibility) return false;
	const { shareWith, ...values } = input;
	const shares = shareWith.filter((uid) => uid !== existing.createdBy);
	db.transaction((tx) => {
		tx.update(task)
			.set(values)
			.where(and(eq(task.familyId, familyId), eq(task.id, id)))
			.run();
		tx.delete(taskShare).where(eq(taskShare.taskId, id)).run();
		if (input.visibility === 'shared' && shares.length) {
			tx.insert(taskShare)
				.values(shares.map((userId) => ({ taskId: id, userId })))
				.run();
		}
	});
	return true;
}

/** Everyone who can see a task may tick it off, above all the person it is assigned to. */
export async function setTaskDone(
	db: DB,
	familyId: string,
	viewerId: string,
	id: string,
	done: boolean
) {
	const existing = await getTask(db, familyId, viewerId, id);
	if (!existing) return false;
	await db
		.update(task)
		.set(done ? { doneAt: new Date(), doneBy: viewerId } : { doneAt: null, doneBy: null })
		.where(and(eq(task.familyId, familyId), eq(task.id, id)));
	if (done && existing.repeat && !existing.doneAt) await repeatTask(db, existing);
	return true;
}

/**
 * A repeating task that was ticked off comes back on its next due date after today. The series
 * moves to the new task, so ticking the old one off again later does not create a second one.
 */
async function repeatTask(
	db: DB,
	done: NonNullable<Awaited<ReturnType<typeof getTask>>>,
	now = today()
) {
	const after = done.dueDate > now ? done.dueDate : now;
	const dueDate = nextDate(done.dueDate, done.repeat!, after);
	if (!dueDate) return null;
	db.transaction((tx) => {
		tx.update(task).set({ repeat: null }).where(eq(task.id, done.id)).run();
		const row = tx
			.insert(task)
			.values({
				familyId: done.familyId,
				title: done.title,
				notes: done.notes,
				dueDate,
				assigneeId: done.assigneeId,
				visibility: done.visibility,
				repeat: done.repeat,
				createdBy: done.createdBy
			})
			.returning()
			.get();
		if (done.sharedWith.length) {
			tx.insert(taskShare)
				.values(done.sharedWith.map((userId) => ({ taskId: row.id, userId })))
				.run();
		}
	});
	return dueDate;
}

export async function deleteTask(db: DB, familyId: string, viewer: Viewer, id: string) {
	const existing = await getTask(db, familyId, viewer.id, id);
	if (!existing || !canEditTask(existing, viewer)) return false;
	await db.delete(task).where(and(eq(task.familyId, familyId), eq(task.id, id)));
	return true;
}

/** "heute", "morgen" or "am Samstag, 3. Oktober". */
export function dueLabel(date: string, now = new Date()) {
	const day = today(now);
	if (date === day) return 'heute';
	if (date === addDays(day, 1)) return 'morgen';
	return `am ${dayLabel(date)}`;
}

/**
 * Tells the assignee right away that someone else gave them a task. Nothing is sent when the
 * assignee did it themselves or when the assignee did not change.
 */
export async function notifyAssignee(
	db: DB,
	send: Sender,
	t: { id: string; title: string; dueDate: string; assigneeId: string | null },
	actor: { id: string; name: string },
	previousAssigneeId: string | null = null
) {
	if (!t.assigneeId || t.assigneeId === actor.id || t.assigneeId === previousAssigneeId) return 0;
	return sendToUsers(
		db,
		[t.assigneeId],
		{
			title: `Neue Aufgabe von ${actor.name}`,
			body: `${t.title} · fällig ${dueLabel(t.dueDate)}`,
			url: `/kalender/aufgaben/${t.id}`,
			tag: `task:${t.id}`
		},
		send
	);
}
