import { describe, expect, it } from 'vitest';
import { createUser } from './auth';
import { acceptInvite, createInvite } from './families';
import {
	checkTask,
	createTask,
	deleteTask,
	getTask,
	listOverdue,
	listTasks,
	listTasksDue,
	memberIds,
	setTaskDone,
	updateTask,
	type TaskInput
} from './tasks';
import { seedFamily, testDb } from './test/setup';

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
	return { db, family, anna, ben: await join('ben'), cleo: await join('cleo') };
}

function input(values: Partial<TaskInput>): TaskInput {
	return {
		title: 'Aufgabe',
		notes: null,
		dueDate: '2026-10-01',
		assigneeId: null,
		visibility: 'family',
		shareWith: [],
		...values
	};
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('tasks', () => {
	it('checks tasks and keeps assignees able to see them', () => {
		const members = ['a', 'b'];
		expect(checkTask(input({ title: ' ' }), 'a', members)).toEqual({ error: 'Was ist zu tun?' });
		expect(checkTask(input({ dueDate: '2026-13-01' }), 'a', members)).toEqual({
			error: 'Bitte gib ein gültiges Fälligkeitsdatum an.'
		});
		expect(checkTask(input({ assigneeId: 'x' }), 'a', members)).toEqual({
			error: 'Unbekanntes Mitglied.'
		});
		expect(checkTask(input({ assigneeId: 'b', visibility: 'private' }), 'a', members)).toEqual({
			error: 'Eine private Aufgabe kannst du nur dir selbst zuweisen.'
		});
		expect(
			checkTask(input({ assigneeId: 'a', visibility: 'private' }), 'a', members)
		).toMatchObject({ task: { assigneeId: 'a' } });
		expect(
			checkTask(input({ assigneeId: 'b', visibility: 'shared', shareWith: [] }), 'a', members)
		).toMatchObject({ task: { shareWith: ['b'] } });
	});

	it('shows tasks only to the people they are meant for', async () => {
		const { db, family, anna, ben, cleo } = await familyOfThree();
		await createTask(db, family.id, anna.id, input({ title: 'Müll', assigneeId: ben.id }));
		await createTask(db, family.id, anna.id, input({ title: 'Geschenk', visibility: 'private' }));
		await createTask(
			db,
			family.id,
			anna.id,
			input({ title: 'Kino buchen', visibility: 'shared', shareWith: [ben.id] })
		);
		const seen = async (id: string) =>
			titles(await listTasksDue(db, family.id, id, '2026-10-01', '2026-10-01'));
		expect(await seen(anna.id)).toEqual(['Müll', 'Geschenk', 'Kino buchen']);
		expect(await seen(ben.id)).toEqual(['Müll', 'Kino buchen']);
		expect(await seen(cleo.id)).toEqual(['Müll']);

		const other = await seedFamily(db, 'otto');
		expect(
			await listTasksDue(db, other.family.id, other.owner.id, '2026-01-01', '2026-12-31')
		).toEqual([]);
	});

	it('filters my tasks and lists overdue ones', async () => {
		const { db, family, anna, ben } = await familyOfThree();
		await createTask(db, family.id, anna.id, input({ title: 'Für Ben', assigneeId: ben.id }));
		await createTask(db, family.id, anna.id, input({ title: 'Für Anna', assigneeId: anna.id }));
		await createTask(db, family.id, anna.id, input({ title: 'Offen von Anna' }));
		await createTask(
			db,
			family.id,
			ben.id,
			input({ title: 'Offen von Ben', dueDate: '2026-10-05' })
		);

		expect(titles((await listTasks(db, family.id, ben.id, { mine: true })).open)).toEqual([
			'Für Ben',
			'Offen von Ben'
		]);
		expect((await listTasks(db, family.id, ben.id)).open).toHaveLength(4);
		expect(titles(await listOverdue(db, family.id, ben.id, '2026-10-05'))).toEqual([
			'Für Ben',
			'Für Anna',
			'Offen von Anna'
		]);
	});

	it('lets everyone who sees a task tick it off', async () => {
		const { db, family, anna, ben, cleo } = await familyOfThree();
		const t = await createTask(
			db,
			family.id,
			anna.id,
			input({ title: 'Müll', assigneeId: ben.id })
		);
		const secret = await createTask(db, family.id, anna.id, input({ visibility: 'private' }));
		expect(await setTaskDone(db, family.id, ben.id, t.id, true)).toBe(true);
		expect(await setTaskDone(db, family.id, cleo.id, secret.id, true)).toBe(false);

		const { open, done } = await listTasks(db, family.id, anna.id);
		expect(titles(done)).toEqual(['Müll']);
		expect(done[0].done).toBe(true);
		expect(open.map((o) => o.done)).toEqual([false]);
		expect((await getTask(db, family.id, anna.id, t.id))?.doneBy).toBe(ben.id);
		expect(await listOverdue(db, family.id, anna.id, '2026-12-01')).toHaveLength(1);
	});

	it('lets the creator edit and admins edit family tasks only', async () => {
		const { db, family, anna, ben, cleo } = await familyOfThree();
		const ids = await memberIds(db, family.id);
		expect(ids).toHaveLength(3);
		const t = await createTask(db, family.id, ben.id, input({ title: 'Rasen' }));
		const shared = await createTask(
			db,
			family.id,
			ben.id,
			input({ visibility: 'shared', shareWith: [anna.id] })
		);
		const annaAdmin = { id: anna.id, role: 'admin' as const };
		const cleoMember = { id: cleo.id, role: 'member' as const };

		expect(await updateTask(db, family.id, cleoMember, t.id, input({ title: 'X' }))).toBe(false);
		expect(
			await updateTask(
				db,
				family.id,
				annaAdmin,
				t.id,
				input({ title: 'Rasen mähen', assigneeId: cleo.id })
			)
		).toBe(true);
		expect((await getTask(db, family.id, cleo.id, t.id))?.assigneeId).toBe(cleo.id);
		expect(await updateTask(db, family.id, annaAdmin, t.id, input({ visibility: 'private' }))).toBe(
			false
		);
		expect(await deleteTask(db, family.id, annaAdmin, shared.id)).toBe(false);
		expect(await deleteTask(db, family.id, { id: ben.id, role: 'member' }, shared.id)).toBe(true);
	});
});
