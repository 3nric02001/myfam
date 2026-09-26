import { describe, expect, it } from 'vitest';
import {
	deleteSubscription,
	deviceLabel,
	isPushEndpoint,
	listSubscriptions,
	parseSubscription,
	saveSubscription,
	sendToUsers,
	vapidKeys,
	type Sender
} from './push';
import { createSession, createUser, invalidateSession, validateSession } from './auth';
import { changePassword } from './account';
import { seedFamily, testDb } from './test/setup';

const sub = (n: number) => ({
	endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
	keys: { p256dh: 'BPublicKey_-', auth: 'authSecret' }
});

describe('push', () => {
	it('generates the VAPID keys once and keeps them', () => {
		const db = testDb();
		const first = vapidKeys(db);
		expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
		expect(vapidKeys(db)).toEqual(first);
		expect(vapidKeys(db, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toEqual({
			publicKey: 'pub',
			privateKey: 'priv'
		});
	});

	it('only accepts real push services', () => {
		expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
		expect(isPushEndpoint('https://web.push.apple.com/QAbc')).toBe(true);
		expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
		expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
		expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
		expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
		expect(isPushEndpoint('https://evilpush.apple.com.attacker.de/x')).toBe(false);
		expect(isPushEndpoint('https://localhost/x')).toBe(false);
		expect(parseSubscription(sub(1))).toEqual(sub(1));
		expect(parseSubscription({ ...sub(1), keys: { p256dh: 'a b', auth: 'x' } })).toBeNull();
		expect(parseSubscription('nope')).toBeNull();
	});

	it('names devices', () => {
		expect(
			deviceLabel(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
			)
		).toBe('iPhone · Safari');
		expect(
			deviceLabel(
				'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
			)
		).toBe('Android · Chrome');
		expect(deviceLabel(null)).toBeNull();
	});

	it('moves a device to whoever subscribes it last', async () => {
		const db = testDb();
		const { owner: anna } = await seedFamily(db, 'anna');
		const ben = await createUser(db, {
			email: 'ben@example.com',
			name: 'Ben',
			password: 'x'.repeat(10)
		});
		await saveSubscription(db, anna.id, null, sub(1), 'iPhone');
		await saveSubscription(db, ben.id, null, sub(1), 'iPhone');
		expect(await listSubscriptions(db, anna.id)).toEqual([]);
		expect(await listSubscriptions(db, ben.id)).toHaveLength(1);
		// Nobody can remove someone else's device.
		await deleteSubscription(db, anna.id, { endpoint: sub(1).endpoint });
		expect(await listSubscriptions(db, ben.id)).toHaveLength(1);
	});

	it('sends to every device and forgets devices that are gone', async () => {
		const db = testDb();
		const { owner: anna } = await seedFamily(db, 'anna');
		await saveSubscription(db, anna.id, null, sub(1), null);
		await saveSubscription(db, anna.id, null, sub(2), null);
		await saveSubscription(db, anna.id, null, sub(3), null);
		const payloads: string[] = [];
		const send: Sender = async (target, payload) => {
			if (target.endpoint.endsWith('2'))
				throw Object.assign(new Error('gone'), { statusCode: 410 });
			if (target.endpoint.endsWith('3'))
				throw Object.assign(new Error('busy'), { statusCode: 503 });
			payloads.push(payload);
			return { statusCode: 201 };
		};
		const message = { title: 'Zahnarzt', body: 'Heute um 9:00 Uhr', url: '/kalender/1' };
		expect(await sendToUsers(db, [anna.id], message, send)).toBe(1);
		expect(JSON.parse(payloads[0])).toEqual(message);
		const left = (await listSubscriptions(db, anna.id)).map((s) => s.endpoint);
		expect(left).toEqual([sub(1).endpoint, sub(3).endpoint]);
	});

	it('forgets a device when its sign-in ends', async () => {
		const db = testDb();
		const { owner: anna } = await seedFamily(db, 'anna');
		const phone = await createSession(db, anna.id, null);
		const laptop = await createSession(db, anna.id, null);
		const phoneId = (await validateSession(db, phone.token))!.session.id;
		const laptopId = (await validateSession(db, laptop.token))!.session.id;
		await saveSubscription(db, anna.id, phoneId, sub(1), 'iPhone');
		await saveSubscription(db, anna.id, laptopId, sub(2), 'Mac');
		await saveSubscription(db, anna.id, null, sub(3), 'alt');

		await invalidateSession(db, phoneId);
		expect((await listSubscriptions(db, anna.id)).map((s) => s.device)).toEqual(['Mac', 'alt']);

		// A new password signs out the other devices, and their notifications with them.
		const other = await createSession(db, anna.id, null);
		const otherId = (await validateSession(db, other.token))!.session.id;
		const result = await changePassword(db, anna.id, otherId, {
			currentPassword: 'geheim-passwort',
			newPassword: 'ein-neues-passwort'
		});
		expect(result.ok).toBe(true);
		expect(await listSubscriptions(db, anna.id)).toEqual([]);
	});
});
