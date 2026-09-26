<script lang="ts">
	import { Check, ChevronLeft, CircleHelp, X } from '@lucide/svelte';
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

<a href="/einkauf" class="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"
	><ChevronLeft size={16} aria-hidden="true" /> Einkaufsliste</a
>
<h1 class="mb-4 text-xl font-semibold tracking-tight">Angebote</h1>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}

<nav class="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm" aria-label="Woche">
	{#each [{ week: 'this', href: '?', label: 'Diese Woche' }, { week: 'next', href: '?woche=naechste', label: 'Nächste Woche' }] as tab (tab.week)}
		<a
			href={tab.href}
			class="rounded-lg py-2 text-center {data.week === tab.week
				? 'bg-white font-semibold shadow-sm'
				: 'text-slate-500'}"
			aria-current={data.week === tab.week ? 'page' : undefined}>{tab.label}</a
		>
	{/each}
</nav>

{#if data.settings.stores.length && data.items.length}
	{#await data.offers}
		<p class="card mb-5 p-4 text-sm text-slate-500">Suche Angebote …</p>
	{:then offers}
		{@const missing = data.items.filter((i) => !offers.byItem[i.id])}
		<section class="mb-5 space-y-3">
			<p class="px-1 text-xs text-slate-500">
				Angebote vom {shortDate(offers.range.from)} bis {shortDate(offers.range.to)}
			</p>
			{#if offers.questions.length}
				<div class="card px-3">
					<h2 class="flex items-center gap-2 pt-3 font-semibold">
						<CircleHelp size={18} class="text-accent-600" aria-hidden="true" /> Was meinst du genau?
					</h2>
					<p class="text-sm text-slate-500">
						Diese Angebote passen vielleicht. Sie zählen erst, wenn du sie bestätigst. Die Antwort
						gilt auch für später.
					</p>
					<ul>
						{#each offers.questions as q (q.term + '|' + q.variant)}
							<li class="border-b border-slate-100 py-3 text-sm last:border-0">
								<p>
									Zählt <strong>{q.example.product}</strong>
									<span class="text-slate-500"
										>({storeLabel(q.example.store)}{#if q.example.price != null}, {formatPrice(
												q.example.price
											)}{/if})</span
									>
									als „{q.name}“?
								</p>
								<div class="mt-2 flex gap-2">
									{#each [true, false] as fits (fits)}
										<form method="POST" action="?/answer" use:enhance class="flex-1">
											<input type="hidden" name="term" value={q.term} />
											<input type="hidden" name="variant" value={q.variant} />
											<input type="hidden" name="example" value={q.example.product} />
											<input type="hidden" name="fits" value={String(fits)} />
											<button class="{fits ? 'btn-primary' : 'btn-secondary'} w-full"
												>{fits ? 'Ja, zählt' : 'Nein'}</button
											>
										</form>
									{/each}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
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
					Für deine Einkaufsliste gibt es {data.week === 'next' ? 'nächste Woche' : 'diese Woche'}
					keine passenden Angebote in deinen Märkten.
				</p>
			{/if}
			{#if offers.failed}
				<p class="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800">
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
								<span class="block text-xs text-slate-500">
									{#if hit.offer.validFrom && hit.offer.validFrom > data.today}ab {shortDate(
											hit.offer.validFrom
										)}{/if}
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
		<div class="grid grid-cols-2 gap-2">
			<label>
				<span class="label">Gültig ab</span>
				<input type="date" name="validFrom" value={data.today} />
			</label>
			<label>
				<span class="label">Gültig bis</span>
				<input type="date" name="validUntil" required min={data.today} value={data.defaultUntil} />
			</label>
		</div>
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
						<span class="block text-xs text-slate-500">
							{#if o.validFrom && o.validFrom > data.today}ab {shortDate(o.validFrom)}{/if}
							bis {shortDate(o.validUntil)}{#if o.createdBy}&nbsp;· von {o.createdBy}{/if}
						</span>
					</span>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={o.id} />
						<button class="icon-btn" aria-label="Angebot {o.product} löschen"
							><X size={18} aria-hidden="true" /></button
						>
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
						class="size-5 rounded text-brand-600"
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

{#if data.rules.length}
	<details class="card mt-5 px-3">
		<summary class="cursor-pointer py-3 font-semibold"
			>Deine Antworten ({data.rules.length})</summary
		>
		<p class="text-sm text-slate-500">
			Was bei unklaren Angeboten zählt. Entfernst du eine Antwort, fragt die App wieder nach.
		</p>
		<ul>
			{#each data.rules as r (r.term + '|' + r.variant)}
				<li class="flex items-center gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
					<span class="flex-1">
						<span class="block">{r.example}</span>
						<span
							class="flex items-center gap-1 text-xs {r.fits ? 'text-brand-700' : 'text-slate-500'}"
						>
							{#if r.fits}<Check size={12} aria-hidden="true" /> zählt als{:else}zählt nicht als{/if}
							„{r.term}“
						</span>
					</span>
					<form method="POST" action="?/answer" use:enhance>
						<input type="hidden" name="term" value={r.term} />
						<input type="hidden" name="variant" value={r.variant} />
						<input type="hidden" name="example" value={r.example} />
						<input type="hidden" name="fits" value={String(!r.fits)} />
						<button class="text-xs text-slate-500 underline">Ändern</button>
					</form>
					<form method="POST" action="?/forgetRule" use:enhance>
						<input type="hidden" name="term" value={r.term} />
						<input type="hidden" name="variant" value={r.variant} />
						<button class="icon-btn" aria-label="Antwort zu {r.example} entfernen"
							><X size={16} aria-hidden="true" /></button
						>
					</form>
				</li>
			{/each}
		</ul>
	</details>
{/if}
