<script lang="ts">
	import {
		Check,
		ChevronRight,
		Euro,
		ExternalLink,
		Plus,
		ShoppingBasket,
		Tag,
		X
	} from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { formatPrice, STORES, storeLabel } from '$lib/offers';
	import { pricesFor } from '$lib/prices';
	import { shortDate } from '$lib/dates';
	import { CATEGORIES } from '$lib/categories';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let open = $derived(data.items.filter((i) => !i.done));
	let editHistory = $state(false);
	let editCategories = $state(false);
	// Open items by section, sections in supermarket order, empty ones left out.
	let groups = $derived(
		CATEGORIES.map((c) => ({ ...c, items: open.filter((i) => i.category === c.id) })).filter(
			(g) => g.items.length
		)
	);
	let suggestions = $derived(data.history.slice(0, 12));
	let done = $derived(data.items.filter((i) => i.done));

	/** The done item whose price is being entered. */
	let pricing = $state<string | null>(null);

	// Offer details in a pop-up: all offers and known prices for one item, with their source.
	let dialog = $state<HTMLDialogElement>();
	let detailsId = $state<string | null>(null);
	let detailsItem = $derived(data.items.find((i) => i.id === detailsId));
	function showDetails(id: string) {
		detailsId = id;
		dialog?.showModal();
	}
</script>

<svelte:head><title>Einkauf · MyFam</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold tracking-tight">Einkaufsliste</h1>

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
		list="history-names"
		autocomplete="off"
	/>
	<datalist id="history-names">
		{#each data.history as h (h.key)}<option value={h.name}></option>{/each}
	</datalist>
	<input name="quantity" placeholder="Menge" maxlength="30" class="w-20" />
	<button class="btn-primary px-3" aria-label="Hinzufügen"
		><Plus size={22} aria-hidden="true" /></button
	>
</form>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}

{#if suggestions.length}
	<section class="mb-5" aria-label="Oft gekauft">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-slate-500">Oft gekauft</h2>
			<button class="text-sm text-slate-500 underline" onclick={() => (editHistory = !editHistory)}>
				{editHistory ? 'Fertig' : 'Bearbeiten'}
			</button>
		</div>
		<ul class="flex flex-wrap gap-2">
			{#each suggestions as h (h.key)}
				<li>
					{#if editHistory}
						<form method="POST" action="?/forget" use:enhance>
							<input type="hidden" name="key" value={h.key} />
							<button
								class="flex min-h-9 items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pr-2 pl-3 text-sm text-slate-500"
								aria-label="{h.name} aus dem Verlauf entfernen"
								>{h.name}<X size={14} aria-hidden="true" /></button
							>
						</form>
					{:else}
						<form method="POST" action="?/add" use:enhance>
							<input type="hidden" name="name" value={h.name} />
							<button
								class="flex min-h-9 items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pr-3 pl-2 text-sm"
								aria-label="{h.name} hinzufügen"
								><Plus size={14} aria-hidden="true" />{h.name}</button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if open.length}
	{#await data.offers}
		<p class="card mb-5 flex items-center gap-2 p-3 text-sm text-slate-500">
			<Tag size={18} aria-hidden="true" /> Suche Angebote …
		</p>
	{:then offers}
		<a href="/einkauf/angebote" class="card mb-5 flex items-center gap-3 p-3 text-sm">
			<span
				class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600"
				aria-hidden="true"><Tag size={20} strokeWidth={1.75} /></span
			>
			<span class="flex-1">
				{#if !offers.configured}
					<span class="block font-medium">Wo kaufst du ein?</span>
					<span class="block text-slate-500">Märkte wählen, um passende Angebote zu sehen</span>
				{:else if offers.best}
					<span class="block font-medium">
						Tipp: {offers.best.stores.map(storeLabel).join(' + ')}
					</span>
					<span class="block text-slate-500">
						{offers.best.covered} von {open.length}
						{open.length === 1 ? 'Artikel' : 'Artikeln'} im Angebot
					</span>
				{:else}
					<span class="block font-medium">Keine passenden Angebote diese Woche</span>
					<span class="block text-slate-500">Angebot eintragen oder Märkte ändern</span>
				{/if}
				{#if offers.cost.priced}
					<span class="mt-1 block text-xs font-medium text-slate-700">
						Voraussichtlich ≈ {formatPrice(offers.cost.total)}
						<span class="font-normal text-slate-500">
							({offers.cost.priced} von {open.length} mit Preis)</span
						>
					</span>
				{/if}
				{#if offers.configured && offers.next}
					<span class="mt-1 block text-xs text-slate-500">
						Nächste Woche: {offers.next.stores.map(storeLabel).join(' + ')} ({offers.next.covered}
						von {open.length})
					</span>
				{/if}
				{#if offers.questions.length}
					<span class="mt-1 block text-xs font-medium text-accent-700">
						{offers.questions.length}
						{offers.questions.length === 1 ? 'Rückfrage' : 'Rückfragen'}: Was meinst du genau?
					</span>
				{/if}
				{#if offers.failed}
					<span class="mt-1 block text-xs text-accent-700">
						Automatische Angebote gerade nicht erreichbar.
					</span>
				{/if}
			</span>
			<ChevronRight size={18} class="shrink-0 text-slate-400" aria-hidden="true" />
		</a>
	{:catch}
		<p class="card mb-5 flex items-center gap-2 p-3 text-sm text-slate-500">
			<Tag size={18} aria-hidden="true" /> Angebote konnten nicht geladen werden.
		</p>
	{/await}
{/if}

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
	<li class="border-b border-slate-100 last:border-0">
		<div class="flex items-center gap-3 py-1">
			<form id="toggle-{item.id}" method="POST" action="?/toggle" use:enhance class="hidden">
				<input type="hidden" name="id" value={item.id} />
				<input type="hidden" name="done" value={String(!item.done)} />
			</form>
			<button
				form="toggle-{item.id}"
				class="flex min-h-12 items-center"
				aria-label={item.done ? `${item.name} wieder offen` : `${item.name} abhaken`}
			>
				<span
					class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 {item.done
						? 'border-brand-600 bg-brand-600 text-white'
						: 'border-slate-300'}"
					aria-hidden="true"
					>{#if item.done}<Check size={15} strokeWidth={3} />{/if}</span
				>
			</button>
			<div class="min-w-0 flex-1 py-1">
				<button form="toggle-{item.id}" class="block w-full text-left">
					<span class={item.done ? 'text-slate-400 line-through' : ''}>{item.name}</span>
					{#if item.quantity}<span class="ml-1 text-sm text-slate-500">{item.quantity}</span>{/if}
				</button>
				{#if !item.done}
					{#await data.offers then offers}
						{@const best = offers.byItem[item.id]?.[0]}
						{@const cost = offers.cost.perItem[item.id]}
						{#if best || cost}
							<button
								type="button"
								class="flex flex-wrap items-center gap-x-1 text-left text-xs"
								onclick={() => showDetails(item.id)}
							>
								{#if best}
									<span class="flex items-center gap-1 font-medium text-accent-700 underline">
										<Tag size={12} aria-hidden="true" />
										{storeLabel(best.store)}
										{formatPrice(best.price)}</span
									>
									{#if offers.byItem[item.id].length > 1}
										<span class="text-slate-500">+{offers.byItem[item.id].length - 1} weitere</span>
									{/if}
									{#if cost?.cheaper}
										<span class="font-medium text-brand-700">
											· günstiger: {cost.cheaper.product}
											{formatPrice(cost.cheaper.price)}
										</span>
									{/if}
								{:else if cost}
									<span class="text-slate-500 underline">
										≈ {formatPrice(cost.price)} bei {storeLabel(cost.store)}
									</span>
								{/if}
							</button>
						{/if}
					{/await}
				{/if}
				{#if item.createdBy}
					<span class="block text-xs text-slate-400">von {item.createdBy}</span>
				{/if}
			</div>
			{#if editCategories && !item.done}
				<form method="POST" action="?/category" use:enhance>
					<input type="hidden" name="name" value={item.name} />
					<select
						name="category"
						class="w-40 shrink-0 py-1 text-sm"
						aria-label="Bereich für {item.name}"
						value={item.category}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						{#each CATEGORIES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
					</select>
				</form>
			{/if}
			{#if item.done}
				<button
					class="icon-btn"
					aria-label="Preis für {item.name} eintragen"
					aria-expanded={pricing === item.id}
					onclick={() => (pricing = pricing === item.id ? null : item.id)}
					><Euro size={18} aria-hidden="true" /></button
				>
			{/if}
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={item.id} />
				<button class="icon-btn" aria-label="{item.name} löschen"
					><X size={18} aria-hidden="true" /></button
				>
			</form>
		</div>
		{#if pricing === item.id}
			<form
				method="POST"
				action="?/price"
				class="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') pricing = null;
					}}
			>
				<p class="col-span-2 text-sm text-slate-500">
					Was hat {item.name} gekostet? Die App merkt sich den Preis für die Schätzung.
				</p>
				<input type="hidden" name="name" value={item.name} />
				<label>
					<span class="label">Markt</span>
					<select name="store" required class="w-full">
						{#each STORES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
					</select>
				</label>
				<label>
					<span class="label">Preis</span>
					<input name="price" required inputmode="decimal" placeholder="1,99" maxlength="10" />
				</label>
				<label class="col-span-2">
					<span class="label">Produkt (optional)</span>
					<input name="product" maxlength="100" placeholder="z. B. Gut&Günstig {item.name}" />
				</label>
				<button class="btn-primary col-span-2">Preis merken</button>
			</form>
		{/if}
	</li>
{/snippet}

{#if open.length}
	<div class="mb-2 flex justify-end">
		<button
			class="text-sm text-slate-500 underline"
			onclick={() => (editCategories = !editCategories)}
		>
			{editCategories ? 'Fertig' : 'Bereiche ändern'}
		</button>
	</div>
	<div class="space-y-4">
		{#each groups as group (group.id)}
			<section aria-label={group.label}>
				<h2 class="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-500">
					<CategoryIcon category={group.id} />
					{group.label}
					<span class="font-normal">({group.items.length})</span>
				</h2>
				<ul class="card px-3">
					{#each group.items as item (item.id)}{@render row(item)}{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}

{#if done.length}
	<div class="mt-6 mb-2 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-slate-500">
			Erledigt ({done.length})
			{#if form && 'priced' in form}<span class="ml-1 font-normal text-brand-700"
					>Preis für {form.priced} gemerkt</span
				>{/if}
		</h2>
		<form method="POST" action="?/clearDone" use:enhance>
			<button class="text-sm text-slate-500 underline">Erledigte löschen</button>
		</form>
	</div>
	<ul class="card px-3">
		{#each done as item (item.id)}{@render row(item)}{/each}
	</ul>
{/if}

<dialog
	bind:this={dialog}
	class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl bg-surface p-0 text-slate-900 shadow-xl backdrop:bg-black/40"
	onclose={() => (detailsId = null)}
>
	{#if detailsItem}
		<div class="max-h-[80dvh] overflow-y-auto p-4">
			<div class="mb-3 flex items-start justify-between gap-2">
				<h2 class="text-lg font-semibold">{detailsItem.name}</h2>
				<button class="icon-btn -mt-2 -mr-2" aria-label="Schließen" onclick={() => dialog?.close()}
					><X size={18} aria-hidden="true" /></button
				>
			</div>
			{#await data.offers then offers}
				{@const list = offers.byItem[detailsItem.id] ?? []}
				{@const cost = offers.cost.perItem[detailsItem.id]}
				{#if list.length}
					<h3 class="text-sm font-semibold text-slate-500">Angebote</h3>
					<ul class="mb-4">
						{#each list as o, i (i)}
							<li class="border-b border-slate-100 py-2 text-sm last:border-0">
								<span class="block font-medium">{o.product}</span>
								<span class="block">
									{storeLabel(o.store)} ·
									<strong>{formatPrice(o.price)}</strong>
									{#if o.oldPrice}<span class="text-slate-400 line-through"
											>{formatPrice(o.oldPrice)}</span
										>{/if}
								</span>
								<span class="block text-xs text-slate-500">
									{#if o.validFrom && o.validFrom > data.today}ab {shortDate(o.validFrom)}{/if}
									bis {shortDate(o.validUntil)} · Quelle:
									{#if o.source === 'manual'}
										von Hand eingetragen{#if o.by}&nbsp;von {o.by}{/if}
									{:else}
										marktguru.de
									{/if}
								</span>
								{#if o.url}
									<a
										href={o.url}
										target="_blank"
										rel="noopener noreferrer"
										class="link mt-1 inline-flex items-center gap-1 text-xs"
										>{o.source === 'manual' ? 'Prospekt öffnen' : 'Bei marktguru ansehen'}
										<ExternalLink size={12} aria-hidden="true" /></a
									>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{@const shelf = pricesFor(detailsItem.name, data.known)}
				{#if shelf.length}
					<h3 class="text-sm font-semibold text-slate-500">Bekannte Preise</h3>
					<ul>
						{#each shelf as k (k.id)}
							<li
								class="flex items-center gap-2 border-b border-slate-100 py-2 text-sm last:border-0"
							>
								<span class="flex-1">
									<span class="block font-medium">
										{k.product}
										{#if cost?.cheaper?.id === k.id}<span
												class="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700"
												>günstiger als das Angebot</span
											>{/if}
									</span>
									<span class="block"
										>{storeLabel(k.store)} · <strong>{formatPrice(k.price)}</strong></span
									>
									<span class="block text-xs text-slate-500">
										am {shortDate(k.seenOn)} gemerkt{#if k.createdBy}&nbsp;von {k.createdBy}{/if}
									</span>
								</span>
								<form method="POST" action="?/forgetPrice" use:enhance>
									<input type="hidden" name="id" value={k.id} />
									<button class="icon-btn" aria-label="Preis {k.product} vergessen"
										><X size={16} aria-hidden="true" /></button
									>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
				{#if !list.length && !shelf.length}
					<p class="text-sm text-slate-500">Noch kein Angebot und kein Preis bekannt.</p>
				{/if}
			{/await}
		</div>
	{/if}
</dialog>
