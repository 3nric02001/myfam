// Browser side of push notifications: find out whether this device can get them, and switch
// them on or off. Used by the settings page and the prompt in the app layout.

export type PushStatus = 'insecure' | 'ios' | 'unsupported' | 'denied' | 'off' | 'on';

function keyBytes(base64url: string) {
	const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** A subscription made with an older server key can't receive our messages any more. */
function usesKey(sub: PushSubscription, publicKey: string) {
	const key = sub.options.applicationServerKey;
	if (!key) return false;
	const a = new Uint8Array(key);
	const b = keyBytes(publicKey);
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration() {
	// The service worker is registered by SvelteKit; don't wait forever if that failed.
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
	]);
}

async function store(sub: PushSubscription) {
	const res = await fetch('/einstellungen/push', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ subscription: sub.toJSON() })
	});
	if (!res.ok) throw new Error('Das Gerät konnte nicht gespeichert werden.');
}

/** What this device can do right now, and its subscription if notifications are on. */
export async function checkPush(
	publicKey: string
): Promise<{ status: PushStatus; sub?: PushSubscription }> {
	const ios =
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const installed =
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as { standalone?: boolean }).standalone === true;
	if (!isSecureContext) return { status: 'insecure' };
	if (ios && !installed) return { status: 'ios' };
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
		return { status: 'unsupported' };
	if (Notification.permission === 'denied') return { status: 'denied' };
	const reg = await registration();
	if (!reg) return { status: 'unsupported' };
	const sub = await reg.pushManager.getSubscription();
	if (sub && usesKey(sub, publicKey) && Notification.permission === 'granted')
		return { status: 'on', sub };
	return { status: 'off' };
}

/**
 * Asks for permission (if not granted yet), subscribes and stores the device on the server.
 * Throws an Error with a German message if that fails.
 */
export async function enablePush(publicKey: string): Promise<PushSubscription | 'denied' | 'off'> {
	try {
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
		const reg = await registration();
		if (!reg) throw new Error('Der Browser hat den Hintergrunddienst nicht gestartet.');
		let sub = await reg.pushManager.getSubscription();
		if (sub && !usesKey(sub, publicKey)) {
			await sub.unsubscribe();
			sub = null;
		}
		// Without a connection to the push service the browser may never answer.
		sub ??= await Promise.race([
			reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: keyBytes(publicKey)
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Der Push-Dienst des Browsers antwortet nicht.')), 20_000)
			)
		]);
		await store(sub);
		return sub;
	} catch (err) {
		// Browser errors (DOMException) are English and technical, so only show our own.
		throw new Error(
			err instanceof Error && !(err instanceof DOMException)
				? err.message
				: 'Benachrichtigungen konnten nicht eingeschaltet werden.',
			{ cause: err }
		);
	}
}

/** Makes sure the server has this subscription for the signed-in user. */
export async function syncPush(sub: PushSubscription) {
	await store(sub).catch(() => {});
}

export async function disablePush() {
	const reg = await registration();
	const sub = await reg?.pushManager.getSubscription();
	if (!sub) return;
	await fetch('/einstellungen/push', {
		method: 'DELETE',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ endpoint: sub.endpoint })
	});
	await sub.unsubscribe();
}

// Remembers on this device that the user answered the prompt in the app (or switched
// notifications off in the settings), so it is not shown again.
const PROMPT_KEY = 'push-prompt';

export function promptAnswered() {
	try {
		return localStorage.getItem(PROMPT_KEY) !== null;
	} catch {
		return false;
	}
}

export function answerPrompt() {
	try {
		localStorage.setItem(PROMPT_KEY, new Date().toISOString());
	} catch {
		// Private mode: the prompt just comes back next time.
	}
}
