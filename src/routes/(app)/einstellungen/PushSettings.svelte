<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, BellOff, BellRing, Send, Share, Smartphone, Trash2 } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let {
		publicKey,
		devices,
		message,
		success
	}: {
		publicKey: string;
		devices: { id: string; endpoint: string; device: string | null }[];
		message?: string;
		success?: string;
	} = $props();

	type Status = 'loading' | 'insecure' | 'ios' | 'unsupported' | 'denied' | 'off' | 'on';
	let status = $state<Status>('loading');
	let busy = $state(false);
	let problem = $state('');
	/** The subscription of this browser, to mark it in the device list. */
	let endpoint = $state<string | null>(null);

	function keyBytes(base64url: string) {
		const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
			.replace(/-/g, '+')
			.replace(/_/g, '/');
		return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	}

	/** A subscription made with an older server key can't receive our messages any more. */
	function usesOurKey(sub: PushSubscription) {
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

	onMount(async () => {
		const ios =
			/iPad|iPhone|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const installed =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as { standalone?: boolean }).standalone === true;
		if (!isSecureContext) return (status = 'insecure');
		if (ios && !installed) return (status = 'ios');
		if (
			!('serviceWorker' in navigator) ||
			!('PushManager' in window) ||
			!('Notification' in window)
		)
			return (status = 'unsupported');
		if (Notification.permission === 'denied') return (status = 'denied');
		const reg = await registration();
		if (!reg) return (status = 'unsupported');
		const sub = await reg.pushManager.getSubscription();
		if (sub && usesOurKey(sub) && Notification.permission === 'granted') {
			endpoint = sub.endpoint;
			status = 'on';
			// Links this device to whoever is signed in now, e.g. after someone else used it.
			if (!devices.some((d) => d.endpoint === sub.endpoint)) {
				await store(sub).catch(() => {});
				await invalidateAll();
			}
		} else status = 'off';
	});

	async function enable() {
		busy = true;
		problem = '';
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				status = permission === 'denied' ? 'denied' : 'off';
				return;
			}
			const reg = await registration();
			if (!reg) throw new Error('Der Browser hat den Hintergrunddienst nicht gestartet.');
			let sub = await reg.pushManager.getSubscription();
			if (sub && !usesOurKey(sub)) {
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
					setTimeout(
						() => reject(new Error('Der Push-Dienst des Browsers antwortet nicht.')),
						20_000
					)
				)
			]);
			await store(sub);
			endpoint = sub.endpoint;
			status = 'on';
			await invalidateAll();
		} catch (err) {
			// Browser errors (DOMException) are English and technical, so only show our own.
			problem =
				err instanceof Error && !(err instanceof DOMException)
					? err.message
					: 'Benachrichtigungen konnten nicht eingeschaltet werden.';
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		problem = '';
		try {
			const reg = await registration();
			const sub = await reg?.pushManager.getSubscription();
			if (sub) {
				await fetch('/einstellungen/push', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: sub.endpoint })
				});
				await sub.unsubscribe();
			}
			endpoint = null;
			status = 'off';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	let others = $derived(devices.filter((d) => d.endpoint !== endpoint));
</script>

<div class="card mb-6 divide-y divide-slate-100 overflow-hidden">
	<div class="flex min-h-14 items-center gap-3 px-4 py-3">
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-lg {status === 'on'
				? 'bg-brand-100 text-brand-700'
				: 'bg-slate-100 text-slate-600'}"
			aria-hidden="true"
		>
			{#if status === 'on'}<BellRing size={18} />{:else if status === 'denied'}<BellOff
					size={18}
				/>{:else}<Bell size={18} />{/if}
		</span>
		<div class="min-w-0 flex-1">
			<p class="font-medium">Erinnerungen auf diesem Gerät</p>
			<p class="text-sm text-slate-500">
				{#if status === 'loading'}
					Wird geprüft …
				{:else if status === 'on'}
					Eingeschaltet
				{:else if status === 'off'}
					Aus
				{:else if status === 'denied'}
					Im Browser blockiert
				{:else}
					Nicht verfügbar
				{/if}
			</p>
		</div>
		{#if status === 'off'}
			<button type="button" class="btn-primary shrink-0" disabled={busy} onclick={enable}
				>Einschalten</button
			>
		{:else if status === 'on'}
			<button type="button" class="btn-secondary shrink-0" disabled={busy} onclick={disable}
				>Ausschalten</button
			>
		{/if}
	</div>

	{#if status === 'ios'}
		<div class="space-y-2 px-4 py-3 text-sm text-slate-600">
			<p>
				Auf dem iPhone und iPad klappt das nur, wenn MyFam als App auf dem Home-Bildschirm liegt (ab
				iOS 16.4):
			</p>
			<ol class="list-decimal space-y-1 pl-5">
				<li>
					In Safari unten auf <Share
						size={15}
						class="inline align-text-bottom"
						aria-label="Teilen"
					/> tippen.
				</li>
				<li>„Zum Home-Bildschirm“ wählen.</li>
				<li>MyFam vom Home-Bildschirm öffnen und hier einschalten.</li>
			</ol>
		</div>
	{:else if status === 'denied'}
		<p class="px-4 py-3 text-sm text-slate-600">
			Du hast Benachrichtigungen für MyFam abgelehnt. Erlaube sie in den Einstellungen des Browsers
			oder Handys und lade die Seite dann neu.
		</p>
	{:else if status === 'insecure'}
		<p class="px-4 py-3 text-sm text-slate-600">
			Benachrichtigungen gehen nur, wenn MyFam über HTTPS aufgerufen wird.
		</p>
	{:else if status === 'unsupported'}
		<p class="px-4 py-3 text-sm text-slate-600">
			Dieser Browser kann keine Benachrichtigungen empfangen.
		</p>
	{/if}

	{#if problem || message || success}
		<div class="px-4 py-3">
			{#if problem || message}<p class="error">{problem || message}</p>{/if}
			{#if success}<p class="success" role="status">{success}</p>{/if}
		</div>
	{/if}

	{#if status === 'on'}
		<form method="POST" action="?/pushTest" use:enhance>
			<button class="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-brand-700">
				<Send size={18} aria-hidden="true" />
				Testnachricht schicken
			</button>
		</form>
	{/if}

	{#each others as device (device.id)}
		<form
			method="POST"
			action="?/pushRemove"
			use:enhance
			class="flex min-h-12 items-center gap-3 px-4 py-2"
		>
			<input type="hidden" name="id" value={device.id} />
			<Smartphone size={18} class="shrink-0 text-slate-400" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate text-sm">{device.device ?? 'Anderes Gerät'}</span>
			<button
				class="icon-btn text-slate-400"
				aria-label="Benachrichtigungen für dieses Gerät beenden"
				><Trash2 size={18} aria-hidden="true" /></button
			>
		</form>
	{/each}
</div>
<p class="-mt-4 mb-6 px-1 text-xs text-slate-500">
	Du bekommst Erinnerungen zu Terminen, die du sehen darfst. Die Zeit legt man pro Termin fest.
</p>
