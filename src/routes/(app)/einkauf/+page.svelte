<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatPrice, storeLabel } from '$lib/offers';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let open = $derived(data.items.filter((i) => !i.done));
	let done = $derived(data.items.filter((i) => i.done));
</script>

<svelte:head><title>Einkauf · MyFam</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">Einkaufsliste</h1>

<form
	method="POST"
	action="?/add"
	class="card mb-5 flex gap-2 p-3"
	use:enhance={() =>
		async ({ update }) => {
			await update({ reset: true });
			document.querySelector<HTMLInputElement>('#new-item')?.focus();
		}}
>
	<input
		id="new-item"
		name="name"
		placeholder="Was fehlt?"
		required
		maxlength="100"
		class="flex-1"
	/>
	<input name="quantity" placeholder="Menge" maxlength="30" class="w-20" />
	<button class="btn-primary px-4" aria-label="Hinzufügen">+</button>
</form>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}

{#if open.length}
	{#await data.offers}
		<p class="card mb-5 p-3 text-sm text-slate-500">🏷️ Suche Angebote …</p>
	{:then offers}
		<a href="/einkauf/angebote" class="card mb-5 block p-3 text-sm">
			{#if !offers.configured}
				<span class="font-medium">🏷️ Wo kaufst du ein?</span>
				<span class="block text-slate-500">Märkte wählen, um passende Angebote zu sehen →</span>
			{:else if offers.best}
				<span class="block font-medium">
					🏷️ Tipp: {offers.best.stores.map(storeLabel).join(' + ')}
				</span>
				<span class="block text-slate-500">
					{offers.best.covered} von {open.length}
					{open.length === 1 ? 'Artikel' : 'Artikeln'} im Angebot · Details →
				</span>
			{:else}
				<span class="font-medium">🏷️ Keine passenden Angebote gefunden</span>
				<span class="block text-slate-500">Angebot eintragen oder Märkte ändern →</span>
			{/if}
			{#if offers.failed}
				<span class="mt-1 block text-xs text-amber-700">
					Automatische Angebote gerade nicht erreichbar.
				</span>
			{/if}
		</a>
	{:catch}
		<p class="card mb-5 p-3 text-sm text-slate-500">🏷️ Angebote konnten nicht geladen werden.</p>
	{/await}
{/if}

{#if data.items.length === 0}
	<p class="py-10 text-center text-slate-500">Die Liste ist leer. 🎉</p>
{/if}

{#snippet row(item: (typeof data.items)[number])}
	<li class="flex items-center gap-3 border-b border-slate-100 py-1 last:border-0">
		<form method="POST" action="?/toggle" use:enhance class="flex flex-1 items-center">
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="done" value={String(!item.done)} />
			<button class="flex min-h-12 flex-1 items-center gap-3 text-left">
				<span
					class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 {item.done
						? 'border-emerald-600 bg-emerald-600 text-white'
						: 'border-slate-300'}"
					aria-hidden="true">{item.done ? '✓' : ''}</span
				>
				<span class="flex-1">
					<span class={item.done ? 'text-slate-400 line-through' : ''}>{item.name}</span>
					{#if item.quantity}<span class="ml-1 text-sm text-slate-500">{item.quantity}</span>{/if}
					{#if !item.done}
						{#await data.offers then offers}
							{@const best = offers.byItem[item.id]?.[0]}
							{#if best}
								<span class="block text-xs font-medium text-emerald-700">
									🏷️ {storeLabel(best.store)}
									{formatPrice(best.price)}
									{#if offers.byItem[item.id].length > 1}
										<span class="font-normal text-slate-500">
											+{offers.byItem[item.id].length - 1} weitere</span
										>
									{/if}
								</span>
							{/if}
						{/await}
					{/if}
					{#if item.createdBy}
						<span class="block text-xs text-slate-400">von {item.createdBy}</span>
					{/if}
				</span>
			</button>
		</form>
		<form method="POST" action="?/delete" use:enhance>
			<input type="hidden" name="id" value={item.id} />
			<button class="p-2 text-slate-400" aria-label="{item.name} löschen">✕</button>
		</form>
	</li>
{/snippet}

{#if open.length}
	<ul class="card px-3">
		{#each open as item (item.id)}{@render row(item)}{/each}
	</ul>
{/if}

{#if done.length}
	<div class="mt-6 mb-2 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-slate-500">Erledigt ({done.length})</h2>
		<form method="POST" action="?/clearDone" use:enhance>
			<button class="text-sm text-slate-500 underline">Erledigte löschen</button>
		</form>
	</div>
	<ul class="card px-3">
		{#each done as item (item.id)}{@render row(item)}{/each}
	</ul>
{/if}
