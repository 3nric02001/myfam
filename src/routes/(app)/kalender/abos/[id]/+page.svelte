<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import SubscriptionForm from '../SubscriptionForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let sub = $derived(data.subscription);
</script>

<svelte:head><title>{sub.name} · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a href="/kalender/abos" class="icon-btn -ml-2 text-slate-500" aria-label="Zurück"
		><ChevronLeft size={24} aria-hidden="true" /></a
	>
	<h1 class="flex-1 text-xl font-semibold tracking-tight">Abo bearbeiten</h1>
</div>

<SubscriptionForm action="?/update" submitLabel="Speichern" error={form?.message} values={sub} />

<form
	method="POST"
	action="?/delete"
	class="mt-4"
	use:enhance={({ cancel }) => {
		if (!confirm(`„${sub.name}“ nicht mehr abonnieren? Die Termine verschwinden aus dem Kalender.`))
			cancel();
	}}
>
	<button class="btn-secondary w-full text-red-700">Abo entfernen</button>
</form>
