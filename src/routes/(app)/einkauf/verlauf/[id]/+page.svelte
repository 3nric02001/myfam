<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { dayLabel } from '$lib/dates';
	import { formatPrice, storeLabel } from '$lib/offers';
	import { lineDetails, lineTotal } from '$lib/purchases';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let p = $derived(data.purchase);
</script>

<svelte:head><title>Einkauf bei {storeLabel(p.store)} · MyFam</title></svelte:head>

<a href="/einkauf/verlauf" class="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"
	><ChevronLeft size={16} aria-hidden="true" /> Verlauf</a
>

<div class="card mb-5 p-4">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-semibold tracking-tight">{storeLabel(p.store)}</h1>
			<p class="text-sm text-slate-500">
				{dayLabel(p.date)}{p.createdBy ? ` · von ${p.createdBy}` : ''}
			</p>
		</div>
		<div class="text-right">
			<p class="text-2xl font-bold tabular-nums">{formatPrice(p.total)}</p>
			<p class="text-xs text-slate-500">{p.lines.length} Artikel</p>
		</div>
	</div>
</div>

<ul class="card mb-5 divide-y divide-slate-100">
	{#each p.lines as line (line.id)}
		<li class="flex items-start gap-3 px-4 py-2.5">
			<div class="min-w-0 flex-1">
				<p class="font-medium">{line.name}</p>
				{#if lineDetails(line, formatPrice)}
					<p class="text-xs text-slate-500">{lineDetails(line, formatPrice)}</p>
				{/if}
			</div>
			<span class="tabular-nums">{formatPrice(lineTotal(line))}</span>
		</li>
	{/each}
	<li class="flex items-center justify-between px-4 py-3 font-semibold">
		<span>Summe</span>
		<span class="tabular-nums">{formatPrice(p.total)}</span>
	</li>
</ul>

<form
	method="POST"
	action="?/delete"
	use:enhance={({ cancel }) => {
		if (!confirm('Diesen Einkauf aus dem Verlauf löschen? Gemerkte Preise bleiben erhalten.'))
			cancel();
	}}
>
	<button class="btn-secondary w-full text-red-700">Einkauf löschen</button>
</form>
