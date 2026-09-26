/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Only shows push notifications. Pages are not cached, so the app always shows current data.

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

type Message = { title: string; body: string; url: string; tag?: string };

sw.addEventListener('push', (event) => {
	let message: Message;
	try {
		message = event.data?.json() as Message;
	} catch {
		message = { title: 'MyFam', body: event.data?.text() ?? '', url: '/' };
	}
	event.waitUntil(
		sw.registration.showNotification(message.title, {
			body: message.body,
			tag: message.tag,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			lang: 'de',
			data: { url: message.url }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL((event.notification.data as { url?: string })?.url ?? '/', sw.location.origin)
		.href;
	event.waitUntil(
		(async () => {
			// Reuse an open MyFam window instead of opening another one.
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const client = windows.find((c) => new URL(c.url).origin === sw.location.origin);
			if (client) {
				await client.focus();
				await client.navigate(url);
			} else await sw.clients.openWindow(url);
		})()
	);
});

// The browser renewed the subscription on its own: tell the server about the new one.
sw.addEventListener('pushsubscriptionchange', (event) => {
	const change = event as Event & {
		oldSubscription?: PushSubscription;
		newSubscription?: PushSubscription;
		waitUntil(p: Promise<unknown>): void;
	};
	change.waitUntil(
		(async () => {
			const sub =
				change.newSubscription ??
				(change.oldSubscription &&
					(await sw.registration.pushManager.subscribe(change.oldSubscription.options)));
			if (!sub) return;
			await fetch('/einstellungen/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					subscription: sub.toJSON(),
					replaces: change.oldSubscription?.endpoint
				})
			});
		})()
	);
});
