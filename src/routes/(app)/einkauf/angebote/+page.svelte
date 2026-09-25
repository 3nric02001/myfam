<script lang="ts">
	import { enhance } from '$app/forms';
	import { shortDate } from '$lib/dates';
	import { formatPrice, STORES, storeLabel } from '$lib/offers';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Offers can only be entered for the family's stores; without a choice yet, for all.
	let storeChoices = $derived(
		data.settings.stores.length ? STORES.filter((s) => data.settings.stores.includes(s.id)) : STORES
	);
</script>

<svelte:head><title>Angebote · MyFam</title></svelte:head>

<a href="/einkauf" class="mb-2 inline-block text-sm text-slate-500">← Einkaufsliste</a>
<h1 class="mb-4 text-xl font-bold">Angebote</h1>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}

{#if data.settings.stores.length && data.items.length}
	{#await data.offers}
		<p class="card mb-5 p-4 text-sm text-slate-500">Suche Angebote …</p>
	{:then offers}
		{@const missing = data.items.filter((i) => !offers.byItem[i.id])}
		<section class="mb-5 space-y-3">
			{#if offers.best}
				<div class="card p-4">
					<p class="text-sm text-slate-500">Empfehlung</p>
					<p class="text-lg font-semibold">{offers.best.stores.map(storeLabel).join(' + ')}</p>
					<p class="text-sm text-slate-500">
						{offers.best.covered} von {data.items.length}
						{data.items.length === 1 ? 'Artikel' : 'Artikeln'} im Angebot
						{#if offers.best.stores.length === 2}(zwei Märkte kombiniert){/if}
					</p>
				</div>
			{:else}
				<p class="card p-4 text-sm text-slate-500">
					Für deine Einkaufsliste gibt es gerade keine passenden Angebote in deinen Märkten.
				</p>
			{/if}
			{#if offers.failed}
				<p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
					Automatische Angebote sind gerade nicht erreichbar. Es fehlen vielleicht welche.
				</p>
			{/if}

			{#each offers.stores as result (result.store)}
				<div class="card px-3">
					<h2 class="flex items-baseline justify-between pt-3 font-semibold">
						{storeLabel(result.store)}
						<span class="text-sm font-normal text-slate-500">
							{result.hits.length} von {data.items.length}
							{#if result.saving}· spart {formatPrice(result.saving)}{/if}
						</span>
					</h2>
					<ul>
						{#each result.hits as hit (hit.item.id)}
							<li class="border-b border-slate-100 py-2 text-sm last:border-0">
								<span class="font-medium">{hit.item.name}</span>
								<span class="block text-slate-600">
									{hit.offer.product}
									{#if hit.offer.price != null}
										· <strong>{formatPrice(hit.offer.price)}</strong>
									{/if}
									{#if hit.offer.oldPrice}
										<span class="text-slate-400 line-through"
											>{formatPrice(hit.offer.oldPrice)}</span
										>
									{/if}
								</span>
								<span class="block text-xs text-slate-400">
									bis {shortDate(hit.offer.validUntil)} ·
									{hit.offer.source === 'manual' ? 'eingetragen' : 'marktguru'}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}

			{#if missing.length}
				<p class="px-1 text-sm text-slate-500">
					Ohne Angebot: {missing.map((i) => i.name).join(', ')}
				</p>
			{/if}
		</section>
	{/await}
{/if}

<section class="card mb-5 space-y-3 p-4">
	<h2 class="font-semibold">Angebot eintragen</h2>
	<p class="text-sm text-slate-500">
		Aus dem Prospekt gesehen? Trag es ein, dann zählt es für die Empfehlung mit.
	</p>
	<form
		method="POST"
		action="?/add"
		class="space-y-3"
		use:enhance={({ formElement }) =>
			async ({ result, update }) => {
				// Keep store and date for the next offer from the same leaflet; clear the rest.
				await update({ reset: false });
				if (result.type === 'success') {
					for (const name of ['product', 'price']) {
						(formElement.elements.namedItem(name) as HTMLInputElement).value = '';
					}
					(formElement.elements.namedItem('product') as HTMLInputElement).focus();
				}
			}}
	>
		<div class="grid grid-cols-2 gap-2">
			<label>
				<span class="label">Markt</span>
				<select name="store" required class="w-full">
					{#each storeChoices as store (store.id)}
						<option value={store.id}>{store.label}</option>
					{/each}
				</select>
			</label>
			<label>
				<span class="label">Preis</span>
				<input name="price" inputmode="decimal" placeholder="1,99" maxlength="10" />
			</label>
		</div>
		<label class="block">
			<span class="label">Produkt</span>
			<input name="product" required maxlength="100" placeholder="z. B. Vollmilch 1 l" />
		</label>
		<label class="block">
			<span class="label">Gültig bis</span>
			<input type="date" name="validUntil" required min={data.today} value={data.defaultUntil} />
		</label>
		<button class="btn-primary w-full">Eintragen</button>
	</form>

	{#if data.manual.length}
		<ul class="border-t border-slate-100 pt-1">
			{#each data.manual as o (o.id)}
				<li class="flex items-center gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
					<span class="flex-1">
						<span class="font-medium">{storeLabel(o.store)}</span>
						{o.product}
						{#if o.price != null}· {formatPrice(o.price)}{/if}
						<span class="block text-xs text-slate-400">
							bis {shortDate(o.validUntil)}{#if o.createdBy}&nbsp;· von {o.createdBy}{/if}
						</span>
					</span>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={o.id} />
						<button class="p-2 text-slate-400" aria-label="Angebot {o.product} löschen">✕</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="card space-y-3 p-4">
	<h2 class="font-semibold">Eure Märkte</h2>
	<p class="text-sm text-slate-500">
		Nur Angebote dieser Märkte zählen. Die Auswahl gilt für die ganze Familie.
	</p>
	<form
		method="POST"
		action="?/settings"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
		class="space-y-3"
	>
		<div class="grid grid-cols-2 gap-x-3">
			{#each STORES as store (store.id)}
				<label class="flex min-h-11 items-center gap-2">
					<input
						type="checkbox"
						name="stores"
						value={store.id}
						checked={data.settings.stores.includes(store.id)}
						class="size-5 rounded text-emerald-600"
					/>
					{store.label}
				</label>
			{/each}
		</div>
		<label class="block">
			<span class="label">Postleitzahl</span>
			<input
				name="zip"
				inputmode="numeric"
				pattern={'[0-9]{5}'}
				maxlength="5"
				placeholder="z. B. 80331"
				value={data.settings.zip ?? ''}
			/>
		</label>
		<p class="text-xs text-slate-500">
			{#if data.auto}
				Angebote in der Nähe der Postleitzahl werden automatisch über marktguru gesucht.
			{:else}
				Automatische Angebote sind auf diesem Server ausgeschaltet. Die Postleitzahl wird erst
				gebraucht, wenn sie eingeschaltet werden.
			{/if}
		</p>
		<button class="btn-primary w-full">Speichern</button>
		{#if form && 'saved' in form}<p class="success">Gespeichert.</p>{/if}
	</form>
</section>
