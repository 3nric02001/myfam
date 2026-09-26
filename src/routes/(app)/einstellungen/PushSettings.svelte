<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, BellOff, BellRing, Send, Share, Smartphone, Trash2 } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		answerPrompt,
		checkPush,
		disablePush,
		enablePush,
		syncPush,
		type PushStatus
	} from '$lib/push-client';
	import { notificationKinds } from '$lib/notifications';
	import type { NotificationKind } from '$lib/server/db/schema';

	let {
		publicKey,
		devices,
		off,
		message,
		success
	}: {
		publicKey: string;
		devices: { id: string; endpoint: string; device: string | null }[];
		off: NotificationKind[];
		message?: string;
		success?: string;
	} = $props();

	let status = $state<PushStatus | 'loading'>('loading');
	let busy = $state(false);
	let problem = $state('');
	/** The subscription of this browser, to mark it in the device list. */
	let endpoint = $state<string | null>(null);

	onMount(async () => {
		const result = await checkPush(publicKey);
		status = result.status;
		endpoint = result.sub?.endpoint ?? null;
		// Links this device to whoever is signed in now, e.g. after someone else used it.
		if (result.sub && !devices.some((d) => d.endpoint === result.sub!.endpoint)) {
			await syncPush(result.sub);
			await invalidateAll();
		}
	});

	async function enable() {
		busy = true;
		problem = '';
		try {
			const result = await enablePush(publicKey);
			answerPrompt();
			if (typeof result === 'string') status = result;
			else {
				endpoint = result.endpoint;
				status = 'on';
				await invalidateAll();
			}
		} catch (err) {
			problem = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		problem = '';
		try {
			await disablePush();
			// Switched off on purpose, so the app doesn't ask again.
			answerPrompt();
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
<div class="card mb-2 divide-y divide-slate-100 overflow-hidden">
	{#each notificationKinds as item (item.kind)}
		<form
			method="POST"
			action="?/notification"
			use:enhance={() =>
				({ update }) =>
					update({ reset: false })}
		>
			<input type="hidden" name="kind" value={item.kind} />
			<label class="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
				<span class="min-w-0 flex-1">
					<span class="block font-medium">{item.label}</span>
					<span class="block text-sm text-slate-500">{item.hint}</span>
				</span>
				<input
					type="checkbox"
					name="on"
					role="switch"
					class="peer sr-only"
					checked={!off.includes(item.kind)}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
				<span
					class="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
					aria-hidden="true"
				></span>
			</label>
		</form>
	{/each}
</div>
<p class="mb-6 px-1 text-xs text-slate-500">
	Gilt für alle deine Geräte. Termine, Aufgaben und Kommentare bekommst du nur, wenn du sie sehen
	darfst.
</p>
