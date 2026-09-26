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
	<!-- Kept small: it sits on the dashboard until answered once. -->
	<section class="card mb-4 px-3 py-2.5" aria-live="polite">
		<div class="flex items-center gap-3">
			<span class="shrink-0 text-brand-700" aria-hidden="true"><BellRing size={18} /></span>
			<p class="min-w-0 flex-1 text-sm">
				{#if show === 'ask'}
					Erinnerungen an Termine auf diesem Gerät?
				{:else}
					Für Erinnerungen MyFam über
					<Share size={14} class="inline align-text-bottom" aria-label="Teilen" /> „Zum Home-Bildschirm“
					hinzufügen.
				{/if}
			</p>
			{#if show === 'ask'}
				<button
					type="button"
					class="btn-primary shrink-0 px-3 py-1.5 text-sm"
					disabled={busy}
					onclick={enable}>Einschalten</button
				>
			{/if}
			<button
				type="button"
				class="icon-btn -my-2 -mr-2 shrink-0 text-slate-400"
				aria-label="Schließen"
				onclick={later}><X size={18} aria-hidden="true" /></button
			>
		</div>
		{#if problem}<p class="error mt-2">{problem}</p>{/if}
	</section>
{/if}
