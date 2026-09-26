import { error, json } from '@sveltejs/kit';
import { today } from '$lib/dates';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { isTripDay, tipFor } from '$lib/server/plan';
import type { RequestHandler } from './$types';

/** The store tip for a day, shown while choosing when to shop. */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { family } = requireFamily(locals);
	const date = url.searchParams.get('datum') ?? '';
	const day = today();
	if (!isTripDay(date, day)) error(400, 'Ungültiger Tag');
	return json(await tipFor(db, family.id, date, day));
};
