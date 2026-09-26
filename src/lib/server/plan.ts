import { and, eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { shoppingPlan, task } from './db/schema';
import { createTask } from './tasks';
import { formatPrice, storeLabel } from '$lib/offers';

// The next planned shopping trip. It shows up for everyone as a task in the calendar, and the
// shopping list compares the offers of that day.

export type Plan = typeof shoppingPlan.$inferSelect;

/** The planned trip, if it is still ahead; a past one is dropped. */
export async function getPlan(db: DB, familyId: string, today: string) {
	const [plan] = await db.select().from(shoppingPlan).where(eq(shoppingPlan.familyId, familyId));
	if (!plan) return null;
	if (plan.date < today) {
		await db.delete(shoppingPlan).where(eq(shoppingPlan.familyId, familyId));
		return null;
	}
	return plan;
}

/** Title and notes of the calendar task, from the recommendation for that day. */
export function tripText(input: {
	stores: string[];
	covered: number;
	open: number;
	total: number;
	priced: number;
}) {
	const where = input.stores.length ? ` bei ${input.stores.map(storeLabel).join(' + ')}` : '';
	const notes = [
		`${input.open} Artikel auf der Einkaufsliste.`,
		input.stores.length ? `${input.covered} davon an diesem Tag im Angebot.` : '',
		input.priced ? `Voraussichtlich ≈ ${formatPrice(input.total)}.` : ''
	];
	return { title: `Einkaufen${where}`, notes: notes.filter(Boolean).join(' ') };
}

/** Plans the trip, or moves it: its task is updated while nobody has ticked it off yet. */
export async function planTrip(
	db: DB,
	familyId: string,
	userId: string,
	input: { date: string; title: string; notes: string }
) {
	const [plan] = await db.select().from(shoppingPlan).where(eq(shoppingPlan.familyId, familyId));
	const [existing] = plan?.taskId
		? await db
				.select()
				.from(task)
				.where(and(eq(task.familyId, familyId), eq(task.id, plan.taskId)))
		: [];

	let taskId: string;
	if (existing && !existing.doneAt) {
		await db
			.update(task)
			.set({ title: input.title, notes: input.notes, dueDate: input.date })
			.where(eq(task.id, existing.id));
		taskId = existing.id;
	} else {
		const row = await createTask(db, familyId, userId, {
			title: input.title,
			notes: input.notes,
			dueDate: input.date,
			assigneeId: null,
			visibility: 'family',
			shareWith: []
		});
		taskId = row.id;
	}
	const values = { date: input.date, taskId, createdBy: userId, updatedAt: new Date() };
	await db
		.insert(shoppingPlan)
		.values({ familyId, ...values })
		.onConflictDoUpdate({ target: shoppingPlan.familyId, set: values });
	return taskId;
}

/** Cancels the trip and removes its task, unless someone already ticked it off. */
export async function cancelPlan(db: DB, familyId: string) {
	const [plan] = await db.select().from(shoppingPlan).where(eq(shoppingPlan.familyId, familyId));
	if (!plan) return;
	if (plan.taskId) {
		const [t] = await db.select().from(task).where(eq(task.id, plan.taskId));
		if (t && t.familyId === familyId && !t.doneAt) await db.delete(task).where(eq(task.id, t.id));
	}
	await db.delete(shoppingPlan).where(eq(shoppingPlan.familyId, familyId));
}
