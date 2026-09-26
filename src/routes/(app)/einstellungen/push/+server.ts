import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	deleteSubscription,
	deviceLabel,
	parseSubscription,
	saveSubscription
} from '$lib/server/push';
import type { RequestHandler } from './$types';

// Called by the settings page and the service worker with a browser PushSubscription.

async function body(request: Request) {
	try {
		return (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, 'Ungültige Anfrage.');
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Bitte melde dich an.');
	const data = await body(request);
	const sub = parseSubscription(data.subscription);
	if (!sub) error(400, 'Dieses Gerät kann keine Benachrichtigungen empfangen.');
	if (typeof data.replaces === 'string' && data.replaces !== sub.endpoint) {
		await deleteSubscription(db, locals.user.id, { endpoint: data.replaces });
	}
	await saveSubscription(
		db,
		locals.user.id,
		locals.sessionId,
		sub,
		deviceLabel(request.headers.get('user-agent'))
	);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Bitte melde dich an.');
	const { endpoint } = await body(request);
	if (typeof endpoint === 'string') await deleteSubscription(db, locals.user.id, { endpoint });
	return json({ ok: true });
};
