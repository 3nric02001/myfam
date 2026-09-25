import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { field } from './validation';
import { visibleTo as sharedVisibleTo } from './visibility';
import { calendarEvent, calendarEventShare, membership, user, type Visibility } from './db/schema';

// Every query is scoped to a family and to what the viewer may see:
// events of the whole family, their own events, and events shared with them.

export type EventInput = {
	title: string;
	notes?: string | null;
	startDate: string;
	startTime?: string | null;
	endDate?: string | null;
	endTime?: string | null;
	visibility: Visibility;
	/** Only used for visibility 'shared'. */
	sharedWith?: string[];
};

/** An event that passed checkEvent(). */
export type CheckedEvent = {
	title: string;
	notes: string | null;
	startDate: string;
	startTime: string | null;
	endDate: string;
	endTime: string | null;
	visibility: Visibility;
	sharedWith: string[];
};

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(value: string) {
	if (!DATE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function isVisibility(value: string): value is Visibility {
	return value === 'family' || value === 'shared' || value === 'private';
}

/** Checks an event and normalises it. Returns an error message or the cleaned input. */
export function checkEvent(input: EventInput): { error: string } | { event: CheckedEvent } {
	const title = input.title.trim();
	if (!title) return { error: 'Bitte gib einen Titel an.' };
	if (title.length > 100) return { error: 'Der Titel ist zu lang (max. 100 Zeichen).' };
	const notes = input.notes?.trim() || null;
	if (notes && notes.length > 1000) return { error: 'Die Notiz ist zu lang (max. 1000 Zeichen).' };
	if (!isDate(input.startDate)) return { error: 'Bitte gib ein gültiges Datum an.' };
	const endDate = input.endDate || input.startDate;
	if (!isDate(endDate)) return { error: 'Bitte gib ein gültiges Enddatum an.' };
	const startTime = input.startTime || null;
	// An end time without a start time makes no sense, so all-day events drop it.
	const endTime = startTime ? input.endTime || null : null;
	if ((startTime && !TIME.test(startTime)) || (endTime && !TIME.test(endTime))) {
		return { error: 'Bitte gib eine gültige Uhrzeit an.' };
	}
	const start = `${input.startDate}T${startTime ?? '00:00'}`;
	const end = `${endDate}T${endTime ?? startTime ?? '00:00'}`;
	if (end < start) return { error: 'Das Ende liegt vor dem Beginn.' };
	if (!isVisibility(input.visibility)) return { error: 'Unbekannte Sichtbarkeit.' };
	const sharedWith = input.visibility === 'shared' ? [...new Set(input.sharedWith ?? [])] : [];
	if (input.visibility === 'shared' && sharedWith.length === 0) {
		return { error: 'Wähle mindestens eine Person aus, mit der du den Termin teilen willst.' };
	}
	return {
		event: {
			title,
			notes,
			startDate: input.startDate,
			startTime,
			endDate,
			endTime,
			visibility: input.visibility,
			sharedWith
		}
	};
}

/** Reads the event form used on the new and edit pages. */
export function eventFromForm(form: FormData): EventInput {
	const allDay = form.get('allDay') === 'on';
	return {
		title: field(form, 'title'),
		notes: field(form, 'notes'),
		startDate: field(form, 'startDate'),
		startTime: allDay ? null : field(form, 'startTime'),
		endDate: field(form, 'endDate'),
		endTime: allDay ? null : field(form, 'endTime'),
		visibility: field(form, 'visibility') as Visibility,
		sharedWith: form.getAll('sharedWith').filter((v) => typeof v === 'string')
	};
}

function visibleTo(viewerId: string) {
	return sharedVisibleTo(viewerId, calendarEvent, {
		table: calendarEventShare,
		itemId: calendarEventShare.eventId,
		userId: calendarEventShare.userId
	});
}

/** Events the viewer may see that overlap the given date range (inclusive). */
export async function listEvents(
	db: DB,
	familyId: string,
	viewerId: string,
	from: string,
	to: string
) {
	const rows = await db
		.select({
			id: calendarEvent.id,
			title: calendarEvent.title,
			notes: calendarEvent.notes,
			startDate: calendarEvent.startDate,
			startTime: calendarEvent.startTime,
			endDate: calendarEvent.endDate,
			endTime: calendarEvent.endTime,
			visibility: calendarEvent.visibility,
			createdById: calendarEvent.createdBy,
			createdBy: user.name
		})
		.from(calendarEvent)
		.leftJoin(user, eq(calendarEvent.createdBy, user.id))
		.where(
			and(
				eq(calendarEvent.familyId, familyId),
				lte(calendarEvent.startDate, to),
				gte(calendarEvent.endDate, from),
				visibleTo(viewerId)
			)
		)
		.orderBy(
			asc(calendarEvent.startDate),
			// All-day events first, then by time.
			sql`${calendarEvent.startTime} is not null`,
			asc(calendarEvent.startTime),
			asc(calendarEvent.title)
		);
	return rows;
}

/** One event with the ids it is shared with, if the viewer may see it. */
export async function getEvent(db: DB, familyId: string, viewerId: string, id: string) {
	const [row] = await db
		.select()
		.from(calendarEvent)
		.where(
			and(eq(calendarEvent.familyId, familyId), eq(calendarEvent.id, id), visibleTo(viewerId))
		);
	if (!row) return null;
	const shares = await db
		.select({ userId: calendarEventShare.userId })
		.from(calendarEventShare)
		.where(eq(calendarEventShare.eventId, id));
	return { ...row, sharedWith: shares.map((s) => s.userId) };
}

/**
 * The creator may always change their event. Admins may also change events the whole family sees,
 * so these don't get stuck when the creator leaves. Private and shared events stay the creator's.
 */
export function canEdit(
	event: { createdBy: string | null; visibility: Visibility },
	viewer: { id: string; role: 'admin' | 'member' }
) {
	return (
		event.createdBy === viewer.id || (viewer.role === 'admin' && event.visibility === 'family')
	);
}

/** Keeps only ids of members of the family, without the creator. */
async function familyMemberIds(db: DB, familyId: string, ids: string[], exclude: string | null) {
	if (ids.length === 0) return [];
	const rows = await db
		.select({ userId: membership.userId })
		.from(membership)
		.where(and(eq(membership.familyId, familyId), inArray(membership.userId, ids)));
	return rows.map((r) => r.userId).filter((id) => id !== exclude);
}

export async function createEvent(
	db: DB,
	familyId: string,
	createdBy: string,
	input: CheckedEvent
) {
	const { sharedWith, ...values } = input;
	const members = await familyMemberIds(db, familyId, sharedWith, createdBy);
	// better-sqlite3 transactions are synchronous.
	return db.transaction((tx) => {
		const row = tx
			.insert(calendarEvent)
			.values({ ...values, familyId, createdBy })
			.returning()
			.get();
		if (members.length) {
			tx.insert(calendarEventShare)
				.values(members.map((userId) => ({ eventId: row.id, userId })))
				.run();
		}
		return row;
	});
}

/** Updates an event if the viewer may edit it. Returns false otherwise. */
export async function updateEvent(
	db: DB,
	familyId: string,
	viewer: { id: string; role: 'admin' | 'member' },
	id: string,
	input: CheckedEvent
) {
	const existing = await getEvent(db, familyId, viewer.id, id);
	if (!existing || !canEdit(existing, viewer)) return false;
	// Only the creator may make an event less visible, so an admin can't hide someone else's event.
	if (existing.createdBy !== viewer.id && input.visibility !== existing.visibility) return false;
	const { sharedWith, ...values } = input;
	const members = await familyMemberIds(db, familyId, sharedWith, existing.createdBy);
	db.transaction((tx) => {
		tx.update(calendarEvent)
			.set(values)
			.where(and(eq(calendarEvent.familyId, familyId), eq(calendarEvent.id, id)))
			.run();
		tx.delete(calendarEventShare).where(eq(calendarEventShare.eventId, id)).run();
		if (members.length) {
			tx.insert(calendarEventShare)
				.values(members.map((userId) => ({ eventId: id, userId })))
				.run();
		}
	});
	return true;
}

export async function deleteEvent(
	db: DB,
	familyId: string,
	viewer: { id: string; role: 'admin' | 'member' },
	id: string
) {
	const existing = await getEvent(db, familyId, viewer.id, id);
	if (!existing || !canEdit(existing, viewer)) return false;
	await db
		.delete(calendarEvent)
		.where(and(eq(calendarEvent.familyId, familyId), eq(calendarEvent.id, id)));
	return true;
}
