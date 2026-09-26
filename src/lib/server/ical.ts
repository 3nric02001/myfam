import ICAL from 'ical.js';
import { createHash } from 'node:crypto';
import { addDays } from '$lib/dates';

// Turns iCalendar data (from CalDAV or an ICS link) into plain day ranges in German local time,
// the same shape as our own calendar events. Repeating events are expanded with ical.js, which
// also applies moved (RECURRENCE-ID) and cancelled (EXDATE) occurrences.

const TIME_ZONE = 'Europe/Berlin';

export type Occurrence = {
	id: string;
	title: string;
	location: string | null;
	notes: string | null;
	startDate: string;
	startTime: string | null;
	endDate: string;
	endTime: string | null;
};

/** Repeating events are expanded within this range; single events are always kept. */
export type Window = { from: string; to: string };

/** Stops runaway rules such as FREQ=SECONDLY. */
const MAX_STEPS = 20_000;

const berlin = new Intl.DateTimeFormat('en-CA', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});

function knownZone(tzid: string) {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tzid });
		return true;
	} catch {
		return false;
	}
}

/** Offset of a time zone at an instant, in milliseconds. */
function offsetAt(tzid: string, ms: number) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: tzid,
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
			hourCycle: 'h23'
		})
			.formatToParts(ms)
			.map((p) => [p.type, Number(p.value)])
	);
	const asUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second
	);
	return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant of a wall-clock time in a time zone. */
function wallClockToInstant(t: ICAL.Time, tzid: string) {
	const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
	const first = guess - offsetAt(tzid, guess);
	// Around a DST change the offset at the guess can differ from the one at the result.
	return guess - offsetAt(tzid, first);
}

/** The instant of an ical.js time, preferring the system's zone data for named zones. */
function instantOf(t: ICAL.Time): number {
	// ical.js keeps the TZID of zones it has no definition for in 'timezone'.
	const tzid = (t as ICAL.Time & { timezone?: string }).timezone || t.zone?.tzid;
	if (tzid === 'Z' || tzid === 'UTC' || t.zone === ICAL.Timezone.utcTimezone) {
		return t.toJSDate().getTime();
	}
	if (tzid && tzid !== 'floating' && knownZone(tzid)) return wallClockToInstant(t, tzid);
	// A zone only described by the calendar's VTIMEZONE, e.g. Outlook's Windows names.
	if (t.zone && t.zone.tzid !== 'floating') return t.toUnixTime() * 1000;
	// Floating times mean "local time", which for us is German time.
	return wallClockToInstant(t, TIME_ZONE);
}

function toBerlin(t: ICAL.Time) {
	const parts = Object.fromEntries(
		berlin.formatToParts(instantOf(t)).map((p) => [p.type, p.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}`
	};
}

function dateOf(t: ICAL.Time) {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}

function text(value: unknown, max: number) {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : null;
}

/** Nextcloud marks events as private or "show only busy" this way. */
function isPrivate(component: ICAL.Component) {
	const value = String(component.getFirstPropertyValue('class') ?? '').toUpperCase();
	return value === 'PRIVATE' || value === 'CONFIDENTIAL';
}

function isCancelled(component: ICAL.Component) {
	return String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
}

function occurrence(
	key: string,
	component: ICAL.Component,
	start: ICAL.Time,
	end: ICAL.Time | null
): Occurrence {
	const hidden = isPrivate(component);
	const title = hidden
		? 'Privat'
		: (text(component.getFirstPropertyValue('summary'), 200) ?? 'Termin');
	const location = hidden ? null : text(component.getFirstPropertyValue('location'), 200);
	const notes = hidden ? null : text(component.getFirstPropertyValue('description'), 2000);
	const id = createHash('sha256').update(key).digest('hex').slice(0, 32);

	if (start.isDate) {
		// All-day: DTEND is the day after the last day.
		const last = end && end.compare(start) > 0 ? addDays(dateOf(end), -1) : dateOf(start);
		return {
			id,
			title,
			location,
			notes,
			startDate: dateOf(start),
			startTime: null,
			endDate: last,
			endTime: null
		};
	}
	const s = toBerlin(start);
	let e = end && end.compare(start) > 0 ? toBerlin(end) : null;
	// Ending at midnight means ending with the previous day.
	if (e && e.time === '00:00' && e.date > s.date) e = { date: addDays(e.date, -1), time: '24:00' };
	return {
		id,
		title,
		location,
		notes,
		startDate: s.date,
		startTime: s.time,
		endDate: e?.date ?? s.date,
		endTime: e?.time ?? null
	};
}

function registerTimezones(calendar: ICAL.Component) {
	for (const vtz of calendar.getAllSubcomponents('vtimezone')) {
		const tzid = String(vtz.getFirstPropertyValue('tzid') ?? '');
		if (tzid && !ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(vtz);
	}
}

/**
 * Parses one or more iCalendar texts (CalDAV returns one per event) and returns all
 * occurrences. `scope` makes the ids unique per subscription.
 */
export function occurrences(icsTexts: string[], scope: string, window: Window): Occurrence[] {
	const vevents: ICAL.Component[] = [];
	for (const ics of icsTexts) {
		let calendar: ICAL.Component;
		try {
			calendar = new ICAL.Component(ICAL.parse(ics));
		} catch {
			continue; // One broken event should not hide all others.
		}
		registerTimezones(calendar);
		vevents.push(...calendar.getAllSubcomponents('vevent'));
	}

	// Group by UID, so moved occurrences (RECURRENCE-ID) find their series.
	const byUid = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
	for (const vevent of vevents) {
		const uid = String(vevent.getFirstPropertyValue('uid') ?? '') || crypto.randomUUID();
		const entry = byUid.get(uid) ?? { exceptions: [] };
		if (vevent.hasProperty('recurrence-id')) entry.exceptions.push(vevent);
		else entry.master = vevent;
		byUid.set(uid, entry);
	}

	const result: Occurrence[] = [];
	for (const [uid, { master, exceptions }] of byUid) {
		try {
			if (!master) {
				// Only a moved occurrence was shared with us; show it as a single event.
				for (const ex of exceptions) {
					if (isCancelled(ex)) continue;
					const event = new ICAL.Event(ex);
					result.push(
						occurrence(`${scope}|${uid}|${event.startDate}`, ex, event.startDate, event.endDate)
					);
				}
				continue;
			}
			if (isCancelled(master)) continue;
			const event = new ICAL.Event(master);
			if (!event.startDate) continue;
			if (!event.isRecurring()) {
				result.push(occurrence(`${scope}|${uid}`, master, event.startDate, event.endDate));
				continue;
			}
			for (const ex of exceptions) event.relateException(ex);
			const iterator = event.iterator();
			for (
				let step = 0, next = iterator.next();
				next && step < MAX_STEPS;
				step++, next = iterator.next()
			) {
				// Moved occurrences may land later than their original date, so look one week further.
				if (dateOf(next) > addDays(window.to, 7)) break;
				const details = event.getOccurrenceDetails(next);
				if (isCancelled(details.item.component)) continue;
				const item = occurrence(
					`${scope}|${uid}|${details.recurrenceId}`,
					details.item.component,
					details.startDate,
					details.endDate
				);
				if (item.endDate >= window.from && item.startDate <= window.to) result.push(item);
			}
		} catch {
			// Skip events ical.js cannot understand instead of failing the whole calendar.
		}
	}
	return result;
}
