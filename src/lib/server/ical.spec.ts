import { describe, expect, it } from 'vitest';
import { occurrences } from './ical';

const BERLIN_TZ = `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

const cal = (...events: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:test', BERLIN_TZ, ...events, 'END:VCALENDAR'].join(
		'\r\n'
	);

const window = { from: '2026-01-01', to: '2027-12-31' };

describe('occurrences', () => {
	it('reads a single timed event in German time', () => {
		const [e] = occurrences(
			[
				cal(`BEGIN:VEVENT
UID:1
DTSTART;TZID=Europe/Berlin:20261001T090000
DTEND;TZID=Europe/Berlin:20261001T103000
SUMMARY:Zahnarzt
LOCATION:Praxis Dr. Weiß
DESCRIPTION:Karte mitnehmen
END:VEVENT`)
			],
			'sub',
			window
		);
		expect(e).toMatchObject({
			title: 'Zahnarzt',
			location: 'Praxis Dr. Weiß',
			notes: 'Karte mitnehmen',
			startDate: '2026-10-01',
			startTime: '09:00',
			endDate: '2026-10-01',
			endTime: '10:30'
		});
	});

	it('converts UTC and other zones to German time', () => {
		const list = occurrences(
			[
				cal(
					`BEGIN:VEVENT
UID:utc
DTSTART:20261001T220000Z
SUMMARY:UTC
END:VEVENT`,
					// No VTIMEZONE for New York in the data: the system's zone data is used.
					`BEGIN:VEVENT
UID:ny
DTSTART;TZID=America/New_York:20261030T120000
DTEND;TZID=America/New_York:20261030T130000
SUMMARY:NY
END:VEVENT`
				)
			],
			'sub',
			window
		);
		const byTitle = Object.fromEntries(list.map((e) => [e.title, e]));
		expect(byTitle.UTC).toMatchObject({ startDate: '2026-10-02', startTime: '00:00' });
		// 30 October: Germany is already on winter time (UTC+1), New York not yet (UTC-4).
		expect(byTitle.NY).toMatchObject({ startTime: '17:00', endTime: '18:00' });
	});

	it('treats DTEND of all-day events as exclusive', () => {
		const [e] = occurrences(
			[
				cal(`BEGIN:VEVENT
UID:2
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261017
SUMMARY:Herbstferien
END:VEVENT`)
			],
			'sub',
			window
		);
		expect(e).toMatchObject({
			startDate: '2026-10-12',
			startTime: null,
			endDate: '2026-10-16',
			endTime: null
		});
	});

	it('expands repeating events with exceptions and moved occurrences', () => {
		const list = occurrences(
			[
				cal(
					`BEGIN:VEVENT
UID:training
DTSTART;TZID=Europe/Berlin:20261019T180000
DTEND;TZID=Europe/Berlin:20261019T190000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Berlin:20261026T180000
SUMMARY:Training
END:VEVENT`,
					`BEGIN:VEVENT
UID:training
RECURRENCE-ID;TZID=Europe/Berlin:20261102T180000
DTSTART;TZID=Europe/Berlin:20261103T200000
DTEND;TZID=Europe/Berlin:20261103T210000
SUMMARY:Training (verlegt)
END:VEVENT`
				)
			],
			'sub',
			window
		);
		expect(list.map((e) => [e.startDate, e.startTime, e.title])).toEqual([
			['2026-10-19', '18:00', 'Training'],
			['2026-11-03', '20:00', 'Training (verlegt)'],
			// Still 18:00 after the switch to winter time.
			['2026-11-09', '18:00', 'Training']
		]);
		expect(new Set(list.map((e) => e.id)).size).toBe(3);
	});

	it('limits endless series to the window', () => {
		const list = occurrences(
			[
				cal(`BEGIN:VEVENT
UID:bday
DTSTART;VALUE=DATE:19800315
RRULE:FREQ=YEARLY
SUMMARY:Geburtstag Oma
END:VEVENT`)
			],
			'sub',
			window
		);
		expect(list.map((e) => e.startDate)).toEqual(['2026-03-15', '2027-03-15']);
	});

	it('keeps ids stable across syncs and unique per subscription', () => {
		const ics = cal(`BEGIN:VEVENT
UID:x
DTSTART;VALUE=DATE:20261001
SUMMARY:A
END:VEVENT`);
		const [a] = occurrences([ics], 'sub1', window);
		const [b] = occurrences([ics], 'sub1', window);
		const [c] = occurrences([ics], 'sub2', window);
		expect(a.id).toBe(b.id);
		expect(a.id).not.toBe(c.id);
	});

	it('hides details of private events and skips cancelled ones', () => {
		const list = occurrences(
			[
				cal(
					`BEGIN:VEVENT
UID:p
DTSTART;VALUE=DATE:20261001
SUMMARY:Geheim
DESCRIPTION:Details
CLASS:CONFIDENTIAL
END:VEVENT`,
					`BEGIN:VEVENT
UID:c
DTSTART;VALUE=DATE:20261002
SUMMARY:Abgesagt
STATUS:CANCELLED
END:VEVENT`
				)
			],
			'sub',
			window
		);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ title: 'Privat', notes: null });
	});

	it('skips broken data but keeps the rest', () => {
		const list = occurrences(
			[
				'BEGIN:VCALENDAR\r\nkaputt',
				cal(`BEGIN:VEVENT
UID:ok
DTSTART;VALUE=DATE:20261001
SUMMARY:OK
END:VEVENT`)
			],
			'sub',
			window
		);
		expect(list.map((e) => e.title)).toEqual(['OK']);
	});

	it('ends events at midnight on the previous day', () => {
		const [e] = occurrences(
			[
				cal(`BEGIN:VEVENT
UID:late
DTSTART;TZID=Europe/Berlin:20261010T200000
DTEND;TZID=Europe/Berlin:20261011T000000
SUMMARY:Party
END:VEVENT`)
			],
			'sub',
			window
		);
		expect(e).toMatchObject({ endDate: '2026-10-10', endTime: '24:00' });
	});
});
