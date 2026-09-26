import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createUser } from './auth';
import { task } from './db/schema';
import { acceptInvite, createInvite } from './families';
import { cancelPlan, getPlan, planTrip, tripText } from './plan';
import { getTask, setTaskDone } from './tasks';
import { seedFamily, testDb } from './test/setup';

const TODAY = '2026-09-26';
const trip = (date: string) => ({ date, title: 'Einkaufen bei REWE', notes: '3 Artikel' });

describe('planned shopping trip', () => {
	it('puts the trip in everyone’s calendar as one task', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const bert = await createUser(db, {
			email: 'bert@example.com',
			name: 'Bert',
			password: 'x'.repeat(10)
		});
		await acceptInvite(db, (await createInvite(db, family.id, owner.id)).token, bert.id);

		const id = await planTrip(db, family.id, owner.id, trip('2026-10-03'));
		const seen = await getTask(db, family.id, bert.id, id);
		expect(seen).toMatchObject({ title: 'Einkaufen bei REWE', dueDate: '2026-10-03' });
		expect(seen?.visibility).toBe('family');

		// Moving it moves the same task, even when someone else does it.
		expect(await planTrip(db, family.id, bert.id, trip('2026-10-02'))).toBe(id);
		expect((await getPlan(db, family.id, TODAY))?.date).toBe('2026-10-02');
		expect(await db.select().from(task)).toHaveLength(1);
	});

	it('starts a new task once the old one is ticked off, and cancels cleanly', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const first = await planTrip(db, family.id, owner.id, trip('2026-09-26'));
		await setTaskDone(db, family.id, owner.id, first, true);
		const second = await planTrip(db, family.id, owner.id, trip('2026-10-03'));
		expect(second).not.toBe(first);

		await cancelPlan(db, family.id);
		expect(await getPlan(db, family.id, TODAY)).toBeNull();
		const left = await db.select().from(task);
		expect(left.map((t) => t.id)).toEqual([first]);
	});

	it('forgets a trip in the past and keeps families apart', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		await planTrip(db, a.family.id, a.owner.id, trip('2026-09-25'));
		expect(await getPlan(db, b.family.id, '2026-09-20')).toBeNull();
		expect(await getPlan(db, a.family.id, TODAY)).toBeNull();
		// The task itself stays in the calendar.
		expect(await db.select().from(task).where(eq(task.familyId, a.family.id))).toHaveLength(1);
		await cancelPlan(db, b.family.id);
	});

	it('names the stores and the estimate', () => {
		expect(
			tripText({ stores: ['rewe', 'lidl'], covered: 2, open: 5, total: 2340, priced: 4 })
		).toEqual({
			title: 'Einkaufen bei REWE + Lidl',
			notes:
				'5 Artikel auf der Einkaufsliste. 2 davon an diesem Tag im Angebot. Voraussichtlich ≈ 23,40\u00a0€.'
		});
		expect(tripText({ stores: [], covered: 0, open: 1, total: 0, priced: 0 })).toEqual({
			title: 'Einkaufen',
			notes: '1 Artikel auf der Einkaufsliste.'
		});
	});
});
