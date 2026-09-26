/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Push notifications, and the last seen version of every page for times without a connection.
// Pages always come from the network first, so the app shows current data whenever it can; only
// when the phone is offline (or the network hangs) does the stored copy step in.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const ASSETS = `myfam-assets-${version}`;
/** Pages and their data. Cleared on the login page, so nothing stays behind after logging out. */
const PAGES = 'myfam-pages';
const assetPaths = new Set([...build, ...files]);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(ASSETS)
			.then((cache) => cache.addAll([...assetPaths]))
			.then(() => sw.skipWaiting())
	);
});
sw.addEventListener('activate', (event) =>
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('myfam-assets-') && key !== ASSETS) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	)
);

/** Pages of the logged-in app; login, invites and uploads are never stored. */
const APP_PAGES = /^\/(dashboard|einkauf|kalender|planung|einstellungen|familie)(\/|$)/;
/** How long a slow network gets before the stored page is shown instead. */
const NETWORK_WAIT_MS = 4000;

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (assetPaths.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}
	if (APP_PAGES.test(url.pathname) || url.pathname === '/') {
		event.respondWith(networkFirst(event, request));
	}
});

async function networkFirst(event: FetchEvent, request: Request) {
	const cache = await caches.open(PAGES);
	const network = fetch(request).then(async (res) => {
		if (res.ok && !res.redirected && res.type === 'basic') {
			event.waitUntil(cache.put(request, res.clone()));
		}
		return res;
	});
	const stored = await cache.match(request);
	if (!stored) return network;
	network.catch(() => {});
	const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
	try {
		return (await Promise.race([network, timeout])) ?? stored;
	} catch {
		return stored;
	}
}

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

// The page a tapped notification should open. Kept in the Cache API because the browser may stop
// the service worker before the app has started; the app asks for it once it runs (see
// $lib/push-client openPendingPage). iOS opens installed apps at their start page and has no
// reliable WindowClient.navigate(), so this is how the app gets to the right page there.
const PENDING = new Request('/__myfam/pending-page');

async function setPending(url: string | null) {
	const cache = await caches.open('myfam-notifications');
	if (url) await cache.put(PENDING, new Response(JSON.stringify({ url, at: Date.now() })));
	else await cache.delete(PENDING);
}

async function takePending() {
	const cache = await caches.open('myfam-notifications');
	const res = await cache.match(PENDING);
	if (!res) return null;
	await cache.delete(PENDING);
	const { url, at } = (await res.json()) as { url: string; at: number };
	// An old tap should not move the app around the next time it is opened.
	return Date.now() - at < 2 * 60_000 ? url : null;
}

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL(
		(event.notification.data as { url?: string })?.url ?? '/',
		sw.location.origin
	);
	// Only pages of this app.
	const url =
		target.origin === sw.location.origin ? target.pathname + target.search + target.hash : '/';
	event.waitUntil(
		(async () => {
			await setPending(url);
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const client = windows.find((c) => new URL(c.url).origin === sw.location.origin);
			if (client) {
				// The open app navigates itself; this works where navigate() does not.
				await client.focus().catch(() => {});
				client.postMessage({ type: 'open', url });
			} else {
				await sw.clients.openWindow(url);
			}
		})()
	);
});

sw.addEventListener('message', (event) => {
	const data = event.data as { type?: string } | null;
	if (data?.type === 'pending-page') {
		event.waitUntil(
			takePending().then((url) =>
				(event.source as Client | null)?.postMessage({ type: 'open', url })
			)
		);
	} else if (data?.type === 'opened') {
		event.waitUntil(setPending(null));
	}
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
