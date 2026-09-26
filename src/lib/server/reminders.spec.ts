import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createUser } from './auth';
import { checkEvent, createEvent, type EventInput } from './calendar';
import { acceptInvite, createInvite } from './families';
import { saveSubscription, setNotification, type Sender } from './push';
import { berlinTime, sendDueReminders, whenLabel } from './reminders';
import { saveMeal } from './meals';
import { addItem, setDone } from './shopping';
import { savePurchase } from './purchases';
import { calendarEvent, task } from './db/schema';
import { createTask, notifyAssignee, setTaskDone, type TaskInput } from './tasks';
import { seedFamily, testDb } from './test/setup';

function event(input: Partial<EventInput>) {
	const result = checkEvent({
		title: 'Termin',
		startDate: '2026-10-01',
		visibility: 'family',
		...input
	});
	if ('error' in result) throw new Error(result.error);
	return result.event;
}

async function setup() {
	const db = testDb();
	const { owner: anna, family } = await seedFamily(db, 'anna');
	const ben = await createUser(db, {
		email: 'ben@example.com',
		name: 'Ben',
		password: 'x'.repeat(10)
	});
	await acceptInvite(db, (await createInvite(db, family.id, anna.id)).token, ben.id);
	for (const [n, user] of [anna, ben].entries()) {
		await saveSubscription(
			db,
			user.id,
			null,
			{ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'p', auth: 'a' } },
			null
		);
	}
	// Records who got what: endpoint 0 is Anna's phone, 1 is Ben's.
	const inbox: { to: string; title: string; body: string }[] = [];
	const send: Sender = async (target, payload) => {
		const { title, body } = JSON.parse(payload);
		inbox.push({ to: target.endpoint.endsWith('0') ? 'anna' : 'ben', title, body });
		return { statusCode: 201 };
	};
	// Events are entered well before their reminders.
	db.update(calendarEvent)
		.set({ createdAt: new Date('2026-01-01') })
		.run();
	return { db, family, anna, ben, inbox, send };
}

describe('reminders', () => {
	it('converts German local time, also across daylight saving time', () => {
		expect(berlinTime('2026-07-01', '09:30').toISOString()).toBe('2026-07-01T07:30:00.000Z');
		expect(berlinTime('2026-12-24', '18:00').toISOString()).toBe('2026-12-24T17:00:00.000Z');
		// 2026-10-25 is the switch back to winter time.
		expect(berlinTime('2026-10-25', '00:00').toISOString()).toBe('2026-10-24T22:00:00.000Z');
		expect(berlinTime('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
	});

	it('describes when an event starts', () => {
		const now = berlinTime('2026-10-01', '08:00');
		expect(whenLabel('2026-10-01', '09:30', now)).toBe('Heute um 09:30 Uhr');
		expect(whenLabel('2026-10-02', null, now)).toBe('Morgen, ganztägig');
		expect(whenLabel('2026-10-05', '10:00', now)).toBe('Montag, 5. Oktober um 10:00 Uhr');
	});

	it('sends each reminder once, when it is due, to everyone who may see the event', async () => {
		const { db, family, anna, ben, inbox, send } = await setup();
		await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Arzt', startTime: '10:00', reminder: 30 })
		);
		await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Geheim', startTime: '10:00', reminder: 30, visibility: 'private' })
		);
		await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Ohne', startTime: '10:00', reminder: null })
		);
		await createEvent(
			db,
			family.id,
			ben.id,
			event({
				title: 'Geteilt',
				startTime: '10:00',
				reminder: 30,
				visibility: 'shared',
				sharedWith: [anna.id]
			})
		);
		db.update(calendarEvent)
			.set({ createdAt: new Date('2026-01-01') })
			.run();

		expect(await sendDueReminders(db, berlinTime('2026-10-01', '09:29'), send)).toEqual([]);
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '09:30'), send)).toHaveLength(3);
		expect(inbox.map((m) => `${m.to}:${m.title}`).sort()).toEqual([
			'anna:Arzt',
			'anna:Geheim',
			'anna:Geteilt',
			'ben:Arzt',
			'ben:Geteilt'
		]);
		expect(inbox[0].body).toBe('Heute um 10:00 Uhr');
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '09:31'), send)).toEqual([]);
		expect(inbox).toHaveLength(5);
	});

	it('reminds all-day events the evening before and catches up after a short outage', async () => {
		const { db, family, anna, inbox, send } = await setup();
		await createEvent(db, family.id, anna.id, event({ title: 'Ausflug', reminder: 360 }));
		db.update(calendarEvent)
			.set({ createdAt: new Date('2026-01-01') })
			.run();
		// Due at 18:00 the day before; the server was down until 18:20.
		expect(await sendDueReminders(db, berlinTime('2026-09-30', '18:20'), send)).toHaveLength(1);
		expect(inbox.find((m) => m.to === 'anna')?.body).toBe('Morgen, ganztägig');
	});

	it('skips reminders that are long overdue or were due before the event existed', async () => {
		const { db, family, anna, inbox, send } = await setup();
		await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Alt', startTime: '10:00', reminder: 30 })
		);
		db.update(calendarEvent)
			.set({ createdAt: new Date('2026-01-01') })
			.run();
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '10:30'), send)).toEqual([]);

		// Entered at 09:45 for 10:00 with a 30-minute reminder: already too late.
		const late = await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Spontan', startDate: '2026-10-02', startTime: '10:00', reminder: 30 })
		);
		db.update(calendarEvent)
			.set({ createdAt: berlinTime('2026-10-02', '09:45') })
			.where(eq(calendarEvent.id, late.id))
			.run();
		expect(await sendDueReminders(db, berlinTime('2026-10-02', '09:46'), send)).toEqual([]);
		expect(inbox).toEqual([]);
	});

	it('reminds again when the event moves', async () => {
		const { db, family, anna, send } = await setup();
		const e = await createEvent(db, family.id, anna.id, event({ startTime: '10:00', reminder: 0 }));
		db.update(calendarEvent)
			.set({ createdAt: new Date('2026-01-01') })
			.run();
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '10:00'), send)).toHaveLength(1);
		db.update(calendarEvent).set({ startTime: '11:00' }).run();
		const sent = await sendDueReminders(db, berlinTime('2026-10-01', '11:00'), send);
		expect(sent).toEqual([`event:${e.id}:2026-10-01T09:00:00.000Z`]);
	});

	it('reminds open tasks in the morning of the due day, to the assignee or the creator', async () => {
		const { db, family, anna, ben, inbox, send } = await setup();
		const input = (values: Partial<TaskInput>): TaskInput => ({
			title: 'Aufgabe',
			notes: null,
			dueDate: '2026-10-01',
			assigneeId: null,
			visibility: 'family',
			shareWith: [],
			...values
		});
		await createTask(db, family.id, anna.id, input({ title: 'Müll', assigneeId: ben.id }));
		await createTask(db, family.id, anna.id, input({ title: 'Einkaufen' }));
		const done = await createTask(db, family.id, anna.id, input({ title: 'Erledigt' }));
		await setTaskDone(db, family.id, anna.id, done.id, true);
		await createTask(db, family.id, anna.id, input({ title: 'Morgen', dueDate: '2026-10-02' }));
		db.update(task)
			.set({ createdAt: new Date('2026-01-01') })
			.run();

		expect(await sendDueReminders(db, berlinTime('2026-10-01', '07:59'), send)).toEqual([]);
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '08:00'), send)).toHaveLength(2);
		expect(inbox.map((m) => `${m.to}:${m.title}`).sort()).toEqual([
			'anna:Heute fällig: Einkaufen',
			'ben:Heute fällig: Müll'
		]);
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '08:05'), send)).toEqual([]);
	});

	it('tells the assignee about a new task someone else gave them', async () => {
		const { db, anna, ben, inbox, send } = await setup();
		const t = { id: 'x', title: 'Müll', dueDate: '2026-10-01', assigneeId: ben.id };
		expect(await notifyAssignee(db, send, t, { id: anna.id, name: 'Anna' })).toBe(1);
		expect(inbox).toEqual([
			{ to: 'ben', title: 'Neue Aufgabe von Anna', body: expect.stringMatching(/^Müll · fällig /) }
		]);
		// Not for tasks you take yourself, nor again when the assignee stays the same.
		expect(await notifyAssignee(db, send, t, { id: ben.id, name: 'Ben' })).toBe(0);
		expect(await notifyAssignee(db, send, t, { id: anna.id, name: 'Anna' }, ben.id)).toBe(0);
		expect(
			await notifyAssignee(db, send, { ...t, assigneeId: null }, { id: anna.id, name: 'Anna' })
		).toBe(0);
		expect(inbox).toHaveLength(1);
	});

	it('leaves out people who switched a kind of notification off', async () => {
		const { db, family, anna, ben, inbox, send } = await setup();
		await setNotification(db, ben.id, 'event', false);
		await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Arzt', startTime: '10:00', reminder: 30 })
		);
		db.update(calendarEvent)
			.set({ createdAt: new Date('2026-01-01') })
			.run();
		expect(await sendDueReminders(db, berlinTime('2026-10-01', '09:30'), send)).toHaveLength(1);
		expect(inbox.map((m) => m.to)).toEqual(['anna']);
		// Switching it on again is enough.
		await setNotification(db, ben.id, 'event', true);
		await setNotification(db, ben.id, 'event', true);
		await createEvent(
			db,
			family.id,
			anna.id,
			event({ title: 'Zahnarzt', startTime: '11:00', reminder: 30 })
		);
		db.update(calendarEvent)
			.set({ createdAt: new Date('2026-01-01') })
			.run();
		await sendDueReminders(db, berlinTime('2026-10-01', '10:30'), send);
		expect(inbox.map((m) => m.to).sort()).toEqual(['anna', 'anna', 'ben']);
	});

	it('tells the family on Sunday evening about meals still open next week', async () => {
		const { db, family, anna, inbox, send } = await setup();
		// The family plans lunch and dinner, never breakfast.
		await saveMeal(db, family.id, anna.id, { date: '2026-09-28', slot: 'lunch', name: 'Suppe' });
		for (const date of ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10']) {
			await saveMeal(db, family.id, anna.id, { date, slot: 'dinner', name: 'Brot' });
			await saveMeal(db, family.id, anna.id, { date, slot: 'lunch', name: 'Nudeln' });
		}
		await saveMeal(db, family.id, anna.id, { date: '2026-10-11', slot: 'lunch', name: 'Braten' });

		// 2026-10-04 is a Sunday.
		expect(await sendDueReminders(db, berlinTime('2026-10-03', '18:00'), send)).toEqual([]);
		expect(await sendDueReminders(db, berlinTime('2026-10-04', '17:59'), send)).toEqual([]);
		expect(await sendDueReminders(db, berlinTime('2026-10-04', '18:00'), send)).toEqual([
			`meals:${family.id}:2026-10-05`
		]);
		expect(inbox.map((m) => m.to).sort()).toEqual(['anna', 'ben']);
		expect(inbox[0]).toMatchObject({
			title: 'Essensplan für nächste Woche',
			body: 'Noch 3 Mahlzeiten offen: Mi, So Abend.'
		});
		expect(await sendDueReminders(db, berlinTime('2026-10-04', '18:10'), send)).toEqual([]);
	});

	it('says nothing about meals when the week is planned or the family has no meal plan', async () => {
		const { db, family, anna, inbox, send } = await setup();
		expect(await sendDueReminders(db, berlinTime('2026-10-04', '18:00'), send)).toEqual([]);
		for (let d = 5; d <= 11; d++) {
			const date = `2026-10-${String(d).padStart(2, '0')}`;
			await saveMeal(db, family.id, anna.id, { date, slot: 'dinner', name: 'Brot' });
		}
		expect(await sendDueReminders(db, berlinTime('2026-10-04', '18:00'), send)).toEqual([]);
		expect(inbox).toEqual([]);
	});

	it('reminds whoever ticked off items to photograph the receipt', async () => {
		const { db, family, anna, ben, inbox, send } = await setup();
		const [milk, bread, eggs] = await Promise.all(
			['Milch', 'Brot', 'Eier'].map((name) => addItem(db, family.id, anna.id, { name }))
		);
		const at = (time: string) => berlinTime('2026-10-01', time);
		await setDone(db, family.id, milk.id, true, ben.id, at('10:00'));
		await setDone(db, family.id, bread.id, true, ben.id, at('10:03'));
		// Ticking off twice (e.g. from the offline queue) counts once.
		await setDone(db, family.id, bread.id, true, ben.id, at('10:03'));

		expect(await sendDueReminders(db, at('10:07'), send)).toEqual([]);
		await setDone(db, family.id, eggs.id, true, ben.id, at('10:07'));
		expect(await sendDueReminders(db, at('10:11'), send)).toEqual([]);
		expect(await sendDueReminders(db, at('10:12'), send)).toHaveLength(1);
		expect(inbox).toEqual([
			{
				to: 'ben',
				title: 'Kassenzettel fotografieren?',
				body: 'Du hast 3 Sachen abgehakt. Mit einem Foto vom Bon lernt MyFam die Preise.'
			}
		]);
		// One reminder per shopping trip, even when more is ticked off later.
		await setDone(db, family.id, eggs.id, false, ben.id, at('10:20'));
		await setDone(db, family.id, eggs.id, true, ben.id, at('10:21'));
		expect(await sendDueReminders(db, at('10:30'), send)).toEqual([]);
		expect(inbox).toHaveLength(1);
	});

	it('does not remind about the receipt once one is saved or after a mistaken tick', async () => {
		const { db, family, anna, ben, inbox, send } = await setup();
		const milk = await addItem(db, family.id, anna.id, { name: 'Milch' });
		const bread = await addItem(db, family.id, anna.id, { name: 'Brot' });
		const at = (time: string) => berlinTime('2026-10-01', time);
		await setDone(db, family.id, milk.id, true, ben.id, at('10:00'));
		// Anna photographs the receipt, so Ben is not reminded.
		await savePurchase(db, family.id, anna.id, {
			store: 'Rewe',
			date: '2026-10-01',
			lines: [{ name: 'Milch', product: 'MILCH', price: 119, count: 1, weighed: false }]
		});
		expect(await sendDueReminders(db, at('10:10'), send)).toEqual([]);

		await setDone(db, family.id, bread.id, true, anna.id, at('11:00'));
		await setDone(db, family.id, bread.id, false, anna.id, at('11:01'));
		expect(await sendDueReminders(db, at('11:10'), send)).toEqual([]);

		await setNotification(db, ben.id, 'receipt', false);
		await setDone(db, family.id, bread.id, true, ben.id, at('12:00'));
		expect(await sendDueReminders(db, at('12:05'), send)).toHaveLength(1);
		expect(inbox).toEqual([]);
	});
});
