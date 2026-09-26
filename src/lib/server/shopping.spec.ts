import { describe, expect, it } from 'vitest';
import {
	addItem,
	clearDone,
	deleteItem,
	forgetHistory,
	listHistory,
	listItems,
	listItemsWithCategory,
	setCategory,
	setDone
} from './shopping';
import { seedFamily, testDb } from './test/setup';

describe('shopping list', () => {
	it('adds, checks off and clears items', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const milk = await addItem(db, family.id, owner.id, { name: ' Milch ', quantity: '2 l' });
		await addItem(db, family.id, owner.id, { name: 'Brot', quantity: '' });

		await setDone(db, family.id, milk.id, true);
		let items = await listItems(db, family.id);
		expect(items.map((i) => [i.name, i.quantity, i.done])).toEqual([
			['Brot', null, false],
			['Milch', '2 l', true]
		]);
		expect(items[0].createdBy).toBe('anna');

		await clearDone(db, family.id);
		items = await listItems(db, family.id);
		expect(items.map((i) => i.name)).toEqual(['Brot']);
	});

	it('keeps families apart', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		const item = await addItem(db, a.family.id, a.owner.id, { name: 'Milch' });

		expect(await listItems(db, b.family.id)).toEqual([]);

		// Another family cannot change or delete the item, even with its id.
		await setDone(db, b.family.id, item.id, true);
		await deleteItem(db, b.family.id, item.id);
		await clearDone(db, b.family.id);
		expect((await listItems(db, a.family.id)).map((i) => [i.name, i.done])).toEqual([
			['Milch', false]
		]);
	});

	it('remembers what was bought, most often first, per family', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		await addItem(db, a.family.id, a.owner.id, { name: 'Brot' });
		await addItem(db, a.family.id, a.owner.id, { name: 'milch' });
		await addItem(db, a.family.id, a.owner.id, { name: 'Milch ' });

		const history = await listHistory(db, a.family.id);
		expect(history.map((h) => [h.name, h.uses])).toEqual([
			['Milch', 2],
			['Brot', 1]
		]);
		expect(await listHistory(db, b.family.id)).toEqual([]);

		await forgetHistory(db, b.family.id, history[0].key);
		await forgetHistory(db, a.family.id, history[1].key);
		expect((await listHistory(db, a.family.id)).map((h) => h.name)).toEqual(['Milch']);
	});

	it('guesses sections and remembers corrections per family', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		await addItem(db, a.family.id, a.owner.id, { name: 'Erbsen' });
		await addItem(db, b.family.id, b.owner.id, { name: 'Erbsen' });
		const section = async (familyId: string) =>
			(await listItemsWithCategory(db, familyId)).map((i) => i.category);
		expect(await section(a.family.id)).toEqual(['obst-gemuese']);

		// Anna's family buys frozen peas; that sticks, also when written differently.
		await setCategory(db, a.family.id, 'Erbsen', 'tiefkuehl');
		await addItem(db, a.family.id, a.owner.id, { name: 'erbsen ' });
		expect(await section(a.family.id)).toEqual(['tiefkuehl', 'tiefkuehl']);
		expect(await section(b.family.id)).toEqual(['obst-gemuese']);

		// Choosing the guessed section again drops the correction.
		await setCategory(db, a.family.id, 'Erbsen', 'obst-gemuese');
		expect(await section(a.family.id)).toEqual(['obst-gemuese', 'obst-gemuese']);
	});
});
