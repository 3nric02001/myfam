import { describe, expect, it } from 'vitest';
import { dishStats, nextWeek, suggestDishes, type PastMeal } from './week';

const dinner = (date: string, name: string, ingredients: string | null = null): PastMeal => ({
	date,
	slot: 'dinner',
	name,
	ingredients
});

describe('weekly planning', () => {
	it('plans the coming week, on Monday the current one', () => {
		// 2026-10-04 is a Sunday.
		expect(nextWeek('2026-10-04')).toBe('2026-10-05');
		expect(nextWeek('2026-10-03')).toBe('2026-10-05');
		expect(nextWeek('2026-10-05')).toBe('2026-10-05');
		expect(nextWeek('2026-10-06')).toBe('2026-10-12');
	});

	it('groups earlier meals by dish with the newest spelling and ingredients', () => {
		const [dish] = dishStats([
			dinner('2026-09-04', 'pizza', 'Teig'),
			dinner('2026-09-11', 'Pizza'),
			dinner('2026-09-18', 'Pizza ', null)
		]);
		expect(dish).toMatchObject({
			name: 'Pizza',
			count: 3,
			last: '2026-09-18',
			ingredients: 'Teig'
		});
		// Fridays.
		expect(dish.weekdays[4]).toBe(3);
	});

	it('suggests weekday habits first, then dishes not eaten for a while', () => {
		const dishes = dishStats([
			// Pizza on Fridays, last week too.
			dinner('2026-09-18', 'Pizza'),
			dinner('2026-09-25', 'Pizza'),
			dinner('2026-10-02', 'Pizza'),
			// Lasagne twice, but long ago.
			dinner('2026-07-01', 'Lasagne', '500 g Hack'),
			dinner('2026-08-05', 'Lasagne'),
			// Had last week, so it waits.
			dinner('2026-09-30', 'Curry'),
			// Two weeks ago.
			dinner('2026-09-22', 'Suppe'),
			// Already planned for the week.
			dinner('2026-08-01', 'Chili')
		]);
		const friday = suggestDishes(dishes, '2026-10-09', 'dinner', { planned: ['chili'] });
		expect(friday).toEqual([
			{ name: 'Pizza', ingredients: null, reason: 'Oft am Freitag' },
			{
				name: 'Lasagne',
				ingredients: '500 g Hack',
				reason: 'Lange nicht gegessen · vor 9 Wochen'
			},
			{ name: 'Suppe', ingredients: null, reason: 'Vorletzte Woche' }
		]);
		// On other days pizza is not a habit, and it was eaten last week.
		expect(suggestDishes(dishes, '2026-10-06', 'dinner').map((d) => d.name)).toEqual([
			'Lasagne',
			// Once each: the more recent first.
			'Suppe',
			'Chili'
		]);
	});

	it('suggests dishes of the same meal, any dish when the meal is new', () => {
		const dishes = dishStats([
			{ date: '2026-09-01', slot: 'breakfast', name: 'Müsli', ingredients: null },
			dinner('2026-09-02', 'Pizza')
		]);
		expect(suggestDishes(dishes, '2026-10-06', 'breakfast').map((d) => d.name)).toEqual(['Müsli']);
		expect(suggestDishes(dishes, '2026-10-06', 'lunch')).toHaveLength(2);
	});
});
