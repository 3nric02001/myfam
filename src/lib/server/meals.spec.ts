import { describe, expect, it } from 'vitest';
import {
	addMealsToList,
	cleanIngredients,
	deleteMeal,
	listDishes,
	listMeals,
	parseIngredient,
	saveMeal
} from './meals';
import { addItem, listItems, setDone } from './shopping';
import { seedFamily, testDb } from './test/setup';

describe('meal plan', () => {
	it('keeps one dish per day and meal and sorts by meal', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		await saveMeal(db, family.id, owner.id, { date: '2026-10-01', slot: 'dinner', name: 'Pizza' });
		await saveMeal(db, family.id, owner.id, { date: '2026-10-01', slot: 'lunch', name: 'Suppe' });
		await saveMeal(db, family.id, owner.id, {
			date: '2026-10-01',
			slot: 'dinner',
			name: ' Brotzeit '
		});
		const meals = await listMeals(db, family.id, '2026-10-01', '2026-10-07');
		expect(meals.map((m) => [m.slot, m.name])).toEqual([
			['lunch', 'Suppe'],
			['dinner', 'Brotzeit']
		]);
		await deleteMeal(db, family.id, meals[0].id);
		expect(await listMeals(db, family.id, '2026-10-01', '2026-10-01')).toHaveLength(1);
	});

	it('keeps families apart', async () => {
		const db = testDb();
		const a = await seedFamily(db, 'anna');
		const b = await seedFamily(db, 'bert');
		await saveMeal(db, a.family.id, a.owner.id, {
			date: '2026-10-01',
			slot: 'lunch',
			name: 'Suppe'
		});
		expect(await listMeals(db, b.family.id, '2026-01-01', '2026-12-31')).toEqual([]);
		expect(await listDishes(db, b.family.id)).toEqual([]);
		const [m] = await listMeals(db, a.family.id, '2026-10-01', '2026-10-01');
		await deleteMeal(db, b.family.id, m.id);
		expect(await addMealsToList(db, b.family.id, b.owner.id, [m.id])).toBe(0);
		expect(await listMeals(db, a.family.id, '2026-10-01', '2026-10-01')).toHaveLength(1);
	});

	it('suggests earlier dishes with their latest ingredients', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const plan = (date: string, name: string, ingredients?: string) =>
			saveMeal(db, family.id, owner.id, { date, slot: 'dinner', name, ingredients });
		await plan('2026-10-01', 'Lasagne', 'Nudelplatten');
		await plan('2026-10-02', 'Pizza');
		await plan('2026-10-08', 'lasagne', 'Nudelplatten\nHack');
		await plan('2026-10-09', 'Lasagne');
		const dishes = await listDishes(db, family.id);
		expect(dishes.map((d) => d.name.toLowerCase())).toEqual(['lasagne', 'pizza']);
		expect(dishes[0].ingredients).toBe('Nudelplatten\nHack');
	});

	it('tidies and parses ingredients', () => {
		expect(cleanIngredients('- 500 g Nudeln\n\n• Salz, Pfeffer\n1,5 kg Kartoffeln')).toBe(
			'500 g Nudeln\nSalz\nPfeffer\n1,5 kg Kartoffeln'
		);
		expect(cleanIngredients('  ')).toBeNull();
		expect(parseIngredient('500 g Nudeln')).toEqual({ name: 'Nudeln', quantity: '500 g' });
		expect(parseIngredient('1,5 kg Kartoffeln')).toEqual({
			name: 'Kartoffeln',
			quantity: '1,5 kg'
		});
		expect(parseIngredient('2 Zwiebeln')).toEqual({ name: 'Zwiebeln', quantity: '2' });
		expect(parseIngredient('1 Dose Tomaten')).toEqual({ name: 'Tomaten', quantity: '1 Dose' });
		expect(parseIngredient('Gouda')).toEqual({ name: 'Gouda', quantity: null });
		expect(parseIngredient('Glasnudeln')).toEqual({ name: 'Glasnudeln', quantity: null });
	});

	it('puts ingredients on the shopping list once', async () => {
		const db = testDb();
		const { owner, family } = await seedFamily(db, 'anna');
		const milk = await addItem(db, family.id, owner.id, { name: 'Milch' });
		await addItem(db, family.id, owner.id, { name: 'Zwiebeln' });
		await setDone(db, family.id, milk.id, true);
		await saveMeal(db, family.id, owner.id, {
			date: '2026-10-01',
			slot: 'dinner',
			name: 'Pfannkuchen',
			ingredients: '3 Eier\n500 ml Milch\n2 Zwiebeln'
		});
		const [m] = await listMeals(db, family.id, '2026-10-01', '2026-10-01');

		// Onions are already on the list; milk was bought (checked off) and is needed again.
		expect(await addMealsToList(db, family.id, owner.id, [m.id])).toBe(2);
		const open = (await listItems(db, family.id)).filter((i) => !i.done);
		expect(open.map((i) => [i.name, i.quantity]).sort()).toEqual([
			['Eier', '3'],
			['Milch', '500 ml'],
			['Zwiebeln', null]
		]);
		expect((await listMeals(db, family.id, '2026-10-01', '2026-10-01'))[0].addedToList).toBe(true);

		// Changing the dish asks for the list again; saving it unchanged does not.
		await saveMeal(db, family.id, owner.id, {
			date: '2026-10-01',
			slot: 'dinner',
			name: 'Pfannkuchen',
			ingredients: '3 Eier\n500 ml Milch\n2 Zwiebeln'
		});
		expect((await listMeals(db, family.id, '2026-10-01', '2026-10-01'))[0].addedToList).toBe(true);
		await saveMeal(db, family.id, owner.id, {
			date: '2026-10-01',
			slot: 'dinner',
			name: 'Pfannkuchen',
			ingredients: '3 Eier\n500 ml Milch\nMehl'
		});
		expect((await listMeals(db, family.id, '2026-10-01', '2026-10-01'))[0].addedToList).toBe(false);
	});
});
