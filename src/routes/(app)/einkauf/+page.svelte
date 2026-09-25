<script lang="ts">
	import { Check, Plus, ShoppingBasket, X } from '@lucide/svelte';
	import { enhance } from '$app/forms';
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
	<button class="btn-primary px-3" aria-label="Hinzufügen"
		><Plus size={22} aria-hidden="true" /></button
	>
</form>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}

{#if data.items.length === 0}
	<div class="flex flex-col items-center py-10 text-center text-slate-500">
		<span
			class="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
			><ShoppingBasket size={28} strokeWidth={1.75} aria-hidden="true" /></span
		>
		Die Liste ist leer.
	</div>
{/if}

{#snippet row(item: (typeof data.items)[number])}
	<li class="flex items-center gap-3 border-b border-slate-100 py-1 last:border-0">
		<form method="POST" action="?/toggle" use:enhance class="flex flex-1 items-center">
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="done" value={String(!item.done)} />
			<button class="flex min-h-12 flex-1 items-center gap-3 text-left">
				<span
					class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 {item.done
						? 'border-brand-600 bg-brand-600 text-white'
						: 'border-slate-300'}"
					aria-hidden="true"
					>{#if item.done}<Check size={15} strokeWidth={3} />{/if}</span
				>
				<span class="flex-1">
					<span class={item.done ? 'text-slate-400 line-through' : ''}>{item.name}</span>
					{#if item.quantity}<span class="ml-1 text-sm text-slate-500">{item.quantity}</span>{/if}
					{#if item.createdBy}
						<span class="block text-xs text-slate-400">von {item.createdBy}</span>
					{/if}
				</span>
			</button>
		</form>
		<form method="POST" action="?/delete" use:enhance>
			<input type="hidden" name="id" value={item.id} />
			<button class="icon-btn" aria-label="{item.name} löschen"
				><X size={18} aria-hidden="true" /></button
			>
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
