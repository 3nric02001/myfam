// Changes to the shopping list made without a connection. They wait in localStorage and are
// sent in order once the phone is back online, so ticking things off in a supermarket without
// signal still works.

const KEY = 'myfam-offline-queue';

export type QueuedChange = {
	/** Form action on /einkauf, e.g. 'toggle' or 'add'. */
	action: 'toggle' | 'add';
	fields: Record<string, string>;
	/** For showing pending entries; also keeps entries apart. */
	id: string;
};

export function readQueue(): QueuedChange[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeQueue(queue: QueuedChange[]) {
	try {
		if (queue.length) localStorage.setItem(KEY, JSON.stringify(queue));
		else localStorage.removeItem(KEY);
	} catch {
		// Without storage the change is lost on reload, but still shows until then.
	}
}

/** Sends one change to the server. Resolves false when there is no connection. */
async function post(change: Pick<QueuedChange, 'action' | 'fields'>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(change.fields)) body.set(k, v);
	try {
		await fetch(`/einkauf?/${change.action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		// Any answer counts as delivered: an error would not go away by retrying and would only
		// block the changes behind it.
		return true;
	} catch {
		return false;
	}
}

/** Sends the change now, or keeps it for later. Returns true if it reached the server. */
export async function sendOrQueue(action: QueuedChange['action'], fields: Record<string, string>) {
	if (navigator.onLine && !readQueue().length && (await post({ action, fields }))) return true;
	writeQueue([...readQueue(), { action, fields, id: crypto.randomUUID() }]);
	return false;
}

let flushing: Promise<boolean> | null = null;

/** Sends what is waiting, oldest first. Resolves true if something was sent. */
export function flushQueue() {
	flushing ??= (async () => {
		let sent = false;
		try {
			for (let queue = readQueue(); queue.length; queue = readQueue()) {
				if (!(await post(queue[0]))) break;
				writeQueue(readQueue().filter((c) => c.id !== queue[0].id));
				sent = true;
			}
		} finally {
			flushing = null;
		}
		return sent;
	})();
	return flushing;
}
