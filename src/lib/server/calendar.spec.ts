import { describe, expect, it } from 'vitest';
import { createUser } from './auth';
import {
	checkEvent,
	createEvent,
	deleteEvent,
	getEvent,
	listEvents,
	updateEvent,
	type EventInput
} from './calendar';
import { acceptInvite, createInvite } from './families';
import { seedFamily, testDb } from './test/setup';

function valid(input: Partial<EventInput>) {
	const result = checkEvent({
		title: 'Termin',
		startDate: '2026-10-01',
		visibility: 'family',
		...input
	});
	if ('error' in result) throw new Error(result.error);
	return result.event;
}

async function familyOfThree() {
	const db = testDb();
	const { owner: anna, family } = await seedFamily(db, 'anna');
	const join = async (name: string) => {
		const u = await createUser(db, {
			email: `${name}@example.com`,
			name,
			password: 'x'.repeat(10)
		});
		await acceptInvite(db, (await createInvite(db, family.id, anna.id)).token, u.id);
		return u;
	};
	const ben = await join('ben');
	const cleo = await join('cleo');
	return { db, family, anna, ben, cleo };
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('calendar', () => {
	it('checks events', () => {
		expect(checkEvent({ title: ' ', startDate: '2026-10-01', visibility: 'family' })).toEqual({
			error: 'Bitte gib einen Titel an.'
		});
		expect(checkEvent({ title: 'x', startDate: '2026-02-30', visibility: 'family' })).toEqual({
			error: 'Bitte gib ein gültiges Datum an.'
		});
		expect(
			checkEvent({
				title: 'x',
				startDate: '2026-10-02',
				endDate: '2026-10-01',
				visibility: 'family'
			})
		).toEqual({ error: 'Das Ende liegt vor dem Beginn.' });
		expect(
			checkEvent({
				title: 'x',
				startDate: '2026-10-01',
				startTime: '10:00',
				endTime: '09:00',
				visibility: 'family'
			})
		).toEqual({ error: 'Das Ende liegt vor dem Beginn.' });
		expect(checkEvent({ title: 'x', startDate: '2026-10-01', visibility: 'shared' })).toEqual({
			error: 'Wähle mindestens eine Person aus, mit der du den Termin teilen willst.'
		});
		expect(valid({ title: ' Zahnarzt ', endTime: '12:00' })).toMatchObject({
			title: 'Zahnarzt',
			endDate: '2026-10-01',
			startTime: null,
			endTime: null
		});
	});

	it('shows each event only to the people it is meant for', async () => {
		const { db, family, anna, ben, cleo } = await familyOfThree();
		await createEvent(db, family.id, anna.id, valid({ title: 'Grillen' }));
		await createEvent(
			db,
			family.id,
			anna.id,
			valid({ title: 'Geschenk kaufen', visibility: 'private' })
		);
		await createEvent(
			db,
			family.id,
			anna.id,
			valid({ title: 'Kino', visibility: 'shared', sharedWith: [ben.id] })
		);

		const seenBy = async (id: string) =>
			titles(await listEvents(db, family.id, id, '2026-10-01', '2026-10-01'));
		expect(await seenBy(anna.id)).toEqual(['Geschenk kaufen', 'Grillen', 'Kino']);
		expect(await seenBy(ben.id)).toEqual(['Grillen', 'Kino']);
		expect(await seenBy(cleo.id)).toEqual(['Grillen']);
	});

	it('keeps families apart and ignores non-members when sharing', async () => {
		const { db, family, anna } = await familyOfThree();
		const other = await seedFamily(db, 'otto');
		const event = await createEvent(
			db,
			family.id,
			anna.id,
			valid({ title: 'Kino', visibility: 'shared', sharedWith: [other.owner.id] })
		);

		expect(
			await listEvents(db, other.family.id, other.owner.id, '2026-01-01', '2026-12-31')
		).toEqual([]);
		expect(await getEvent(db, family.id, other.owner.id, event.id)).toBeNull();
		expect((await getEvent(db, family.id, anna.id, event.id))?.sharedWith).toEqual([]);
		expect(
			await deleteEvent(db, other.family.id, { id: other.owner.id, role: 'admin' }, event.id)
		).toBe(false);
	});

	it('finds multi-day events in every day they span', async () => {
		const { db, family, anna } = await familyOfThree();
		await createEvent(db, family.id, anna.id, valid({ title: 'Urlaub', endDate: '2026-10-10' }));
		expect(titles(await listEvents(db, family.id, anna.id, '2026-10-05', '2026-10-05'))).toEqual([
			'Urlaub'
		]);
		expect(await listEvents(db, family.id, anna.id, '2026-10-11', '2026-10-31')).toEqual([]);
	});

	it('lets the creator edit and admins edit family events only', async () => {
		const { db, family, anna, ben, cleo } = await familyOfThree();
		const benAsMember = { id: ben.id, role: 'member' as const };
		const annaAsAdmin = { id: anna.id, role: 'admin' as const };
		const cleoAsMember = { id: cleo.id, role: 'member' as const };

		const party = await createEvent(db, family.id, ben.id, valid({ title: 'Party' }));
		const secret = await createEvent(
			db,
			family.id,
			ben.id,
			valid({ title: 'Geheim', visibility: 'shared', sharedWith: [anna.id] })
		);

		expect(await updateEvent(db, family.id, cleoAsMember, party.id, valid({ title: 'X' }))).toBe(
			false
		);
		expect(await updateEvent(db, family.id, annaAsAdmin, party.id, valid({ title: 'Feier' }))).toBe(
			true
		);
		// An admin may not hide someone else's event.
		expect(
			await updateEvent(db, family.id, annaAsAdmin, party.id, valid({ visibility: 'private' }))
		).toBe(false);
		expect(
			await updateEvent(db, family.id, annaAsAdmin, secret.id, valid({ title: 'Offen' }))
		).toBe(false);

		// The creator can narrow down who sees the event.
		expect(
			await updateEvent(
				db,
				family.id,
				benAsMember,
				secret.id,
				valid({ title: 'Geheim', visibility: 'shared', sharedWith: [cleo.id] })
			)
		).toBe(true);
		expect(await getEvent(db, family.id, anna.id, secret.id)).toBeNull();
		expect((await getEvent(db, family.id, cleo.id, secret.id))?.sharedWith).toEqual([cleo.id]);

		expect(await deleteEvent(db, family.id, benAsMember, party.id)).toBe(true);
		expect(titles(await listEvents(db, family.id, ben.id, '2026-10-01', '2026-10-01'))).toEqual([
			'Geheim'
		]);
	});
});
