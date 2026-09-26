import { today } from '$lib/dates';
import { CHART_PERIODS, periodStart } from '$lib/purchases';
import { db } from '$lib/server/db';
import { requireFamily } from '$lib/server/guards';
import { listPurchases } from '$lib/server/purchases';
import type { PageServerLoad } from './$types';

const MAX_LIST = 500;

export const load: PageServerLoad = async ({ locals }) => {
	const { family } = requireFamily(locals);
	const day = today();
	const purchases = await listPurchases(db, family.id, { limit: MAX_LIST });
	const chartFrom = [
		periodStart('week', day, CHART_PERIODS.week),
		periodStart('month', day, CHART_PERIODS.month)
	].sort()[0];
	return {
		today: day,
		purchases,
		// The list is capped, the chart must not be: load its range on its own when it reaches further.
		chart:
			purchases.length < MAX_LIST
				? purchases.filter((p) => p.date >= chartFrom)
				: await listPurchases(db, family.id, { from: chartFrom })
	};
};
