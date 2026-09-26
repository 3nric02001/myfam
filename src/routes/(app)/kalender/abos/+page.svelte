<script lang="ts">
	import { ChevronLeft, CircleAlert, Pencil, Plus, RefreshCw } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { colorOf } from '$lib/subscriptions';
	import SubscriptionForm from './SubscriptionForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let adding = $state(data.subscriptions.length === 0 || !!form?.message);
	let syncing = $state<string | null>(null);

	$effect(() => {
		if (form && 'created' in form) adding = false;
	});

	const when = new Intl.DateTimeFormat('de-DE', {
		dateStyle: 'short',
		timeStyle: 'short',
		timeZone: 'Europe/Berlin'
	});
</script>

<svelte:head><title>Kalender-Abos · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a href="/kalender" class="icon-btn -ml-2 text-slate-500" aria-label="Zurück"
		><ChevronLeft size={24} aria-hidden="true" /></a
	>
	<h1 class="flex-1 text-xl font-semibold tracking-tight">Kalender-Abos</h1>
</div>

<p class="mb-4 text-sm text-slate-500">
	Termine aus abonnierten Kalendern (z. B. Nextcloud) sieht die ganze Familie, mit dem Namen des
	Abos als Quelle. Sie werden alle 15 Minuten abgeglichen und lassen sich hier nicht bearbeiten.
</p>

{#if form && 'created' in form}
	<p class="success mb-4">„{form.created}“ ist abonniert und wurde abgerufen.</p>
{/if}

{#if data.subscriptions.length}
	<ul class="card mb-5 px-3">
		{#each data.subscriptions as sub (sub.id)}
			<li class="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
				<span class="size-3 shrink-0 rounded-full {colorOf(sub.color).dot}" aria-hidden="true"
				></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate">{sub.name}</span>
					{#if sub.error}
						<span class="flex items-start gap-1 text-xs text-red-700">
							<CircleAlert size={14} class="mt-px shrink-0" aria-hidden="true" />
							{sub.error}
						</span>
					{:else}
						<span class="block text-xs text-slate-500">
							{sub.syncedAt ? `Abgeglichen ${when.format(sub.syncedAt)}` : 'Noch nicht abgerufen'}
						</span>
					{/if}
				</span>
				<form
					method="POST"
					action="?/sync"
					use:enhance={() => {
						syncing = sub.id;
						return async ({ update }) => {
							await update();
							syncing = null;
						};
					}}
				>
					<input type="hidden" name="id" value={sub.id} />
					<button class="icon-btn" aria-label="„{sub.name}“ jetzt abgleichen" disabled={!!syncing}>
						<RefreshCw
							size={20}
							class={syncing === sub.id ? 'animate-spin' : ''}
							aria-hidden="true"
						/>
					</button>
				</form>
				{#if data.isAdmin}
					<a href="/kalender/abos/{sub.id}" class="icon-btn" aria-label="„{sub.name}“ bearbeiten"
						><Pencil size={20} aria-hidden="true" /></a
					>
				{/if}
			</li>
		{/each}
	</ul>
{:else if !data.isAdmin}
	<p class="py-6 text-center text-sm text-slate-500">
		Noch keine Kalender abonniert. Das kann ein Admin der Familie einrichten.
	</p>
{/if}

{#if data.isAdmin}
	{#if adding}
		<h2 class="mb-2 font-semibold">Kalender abonnieren</h2>
		<SubscriptionForm
			action="?/create"
			submitLabel="Abonnieren"
			error={form?.message}
			values={{
				name: form?.values?.name ?? '',
				url: form?.values?.url ?? '',
				username: form?.values?.username ?? '',
				color: form?.values?.color ?? 'blue',
				hasPassword: false
			}}
		/>
	{:else}
		<button class="btn-secondary w-full" onclick={() => (adding = true)}>
			<Plus size={18} aria-hidden="true" /> Kalender abonnieren
		</button>
	{/if}
{/if}
