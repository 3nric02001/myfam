<script lang="ts">
	import { onMount } from 'svelte';
	import { BellRing, Share, X } from '@lucide/svelte';
	import { answerPrompt, checkPush, enablePush, promptAnswered, syncPush } from '$lib/push-client';

	// Reminders are meant to be on by default. Browsers only allow asking for permission after a
	// tap, so a new device gets this prompt once; with permission already given it just subscribes.

	let { publicKey }: { publicKey: string } = $props();

	let show = $state<'ask' | 'ios' | null>(null);
	let busy = $state(false);
	let problem = $state('');

	onMount(async () => {
		const { status, sub } = await checkPush(publicKey);
		if (sub) return syncPush(sub);
		if (status === 'off' && Notification.permission === 'granted') {
			await enablePush(publicKey).catch(() => {});
			return;
		}
		if (promptAnswered()) return;
		if (status === 'off') show = 'ask';
		else if (status === 'ios') show = 'ios';
	});

	async function enable() {
		busy = true;
		problem = '';
		try {
			await enablePush(publicKey);
			answerPrompt();
			show = null;
		} catch (err) {
			problem = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	function later() {
		answerPrompt();
		show = null;
	}
</script>

{#if show}
	<section class="card mb-4 p-4" aria-live="polite">
		<div class="flex items-start gap-3">
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700"
				aria-hidden="true"><BellRing size={18} /></span
			>
			<div class="min-w-0 flex-1">
				<p class="font-medium">Benachrichtigungen</p>
				{#if show === 'ask'}
					<p class="text-sm text-slate-500">
						MyFam erinnert dich auf diesem Gerät an Termine und meldet neue Kommentare in der
						Planung.
					</p>
				{:else}
					<p class="text-sm text-slate-500">
						Dafür MyFam in Safari über
						<Share size={14} class="inline align-text-bottom" aria-label="Teilen" /> „Zum Home-Bildschirm“
						hinzufügen und von dort öffnen (ab iOS 16.4).
					</p>
				{/if}
			</div>
			<button
				type="button"
				class="icon-btn -mt-2 -mr-2 text-slate-400"
				aria-label="Schließen"
				onclick={later}><X size={18} aria-hidden="true" /></button
			>
		</div>
		{#if problem}<p class="error mt-3">{problem}</p>{/if}
		{#if show === 'ask'}
			<div class="mt-3 grid grid-cols-2 gap-2">
				<button type="button" class="btn-secondary" onclick={later}>Später</button>
				<button type="button" class="btn-primary" disabled={busy} onclick={enable}
					>Einschalten</button
				>
			</div>
		{/if}
	</section>
{/if}
