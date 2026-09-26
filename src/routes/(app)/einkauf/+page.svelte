<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		CalendarDays,
		Check,
		ChevronRight,
		Clock,
		Euro,
		Plus,
		ReceiptText,
		ShoppingBasket,
		Store,
		Tag,
		X
	} from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { flushQueue, readQueue, sendOrQueue, type QueuedChange } from '$lib/offline-queue';
	import PersonDot from '$lib/components/PersonDot.svelte';
	import { formatPrice, STORES, storeLabel } from '$lib/offers';
	import { pricesFor } from '$lib/prices';
	import { addDays, shortDate, shortDayLabel } from '$lib/dates';
	import { CATEGORIES, guessCategory, orderedCategories, type CategoryId } from '$lib/categories';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Changes made without a connection, sent when it is back (see $lib/offline-queue).
	let queue = $state<QueuedChange[]>([]);
	// Ticks show at once; the server confirms on the next load (or later, when offline).
	let localDone = $state<Record<string, boolean>>({});
	let items = $derived.by(() => {
		// Ticks still waiting to be sent count too, e.g. after reopening the app offline.
		const waiting = new Map(
			queue.filter((c) => c.action === 'toggle').map((c) => [c.fields.id, c.fields.done === 'true'])
		);
		return data.items.map((i) =>
			i.id in localDone
				? { ...i, done: localDone[i.id] }
				: waiting.has(i.id)
					? { ...i, done: waiting.get(i.id)! }
					: i
		);
	});
	// Once the server agrees, the local tick is no longer needed.
	$effect(() => {
		for (const item of data.items) {
			if (item.id in localDone && localDone[item.id] === item.done) delete localDone[item.id];
		}
	});

	let pendingAdds = $derived(
		queue
			.filter((c) => c.action === 'add')
			.map((c) => ({
				id: c.id,
				name: c.fields.name,
				quantity: c.fields.quantity || null,
				category: guessCategory(c.fields.name) as CategoryId
			}))
	);
	async function flush() {
		if (await flushQueue()) await invalidateAll();
		queue = readQueue();
	}
	onMount(() => {
		queue = readQueue();
		flush();
		window.addEventListener('online', flush);
		return () => window.removeEventListener('online', flush);
	});

	async function toggle(item: { id: string; done: boolean }) {
		localDone[item.id] = !item.done;
		const sent = await sendOrQueue('toggle', { id: item.id, done: String(!item.done) });
		queue = readQueue();
		if (sent) await invalidateAll();
	}

	let open = $derived(items.filter((i) => !i.done));
	let editHistory = $state(false);
	// Open items by section, sections in the family's store order, empty ones left out.
	let sections = $derived(orderedCategories(data.categoryOrder));
	let groups = $derived(
		sections
			.map((c) => ({
				...c,
				items: open.filter((i) => i.category === c.id),
				pending: pendingAdds.filter((p) => p.category === c.id)
			}))
			.filter((g) => g.items.length || g.pending.length)
	);
	let suggestions = $derived(data.history.slice(0, 12));
	let done = $derived(items.filter((i) => i.done));

	// In the store: bigger rows, nothing to delete by accident, and the screen stays on.
	let shopMode = $state(false);
	let wakeLock: { release(): Promise<void> } | null = null;
	async function keepAwake() {
		try {
			wakeLock =
				(await (
					navigator as {
						wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
					}
				).wakeLock?.request('screen')) ?? null;
		} catch {
			wakeLock = null;
		}
	}
	function setShopMode(on: boolean) {
		shopMode = on;
		try {
			if (on) sessionStorage.setItem('einkaufsmodus', '1');
			else sessionStorage.removeItem('einkaufsmodus');
		} catch {
			// Only the mode is not remembered.
		}
		if (on) keepAwake();
		else wakeLock?.release().catch(() => {});
	}
	onMount(() => {
		try {
			if (sessionStorage.getItem('einkaufsmodus')) setShopMode(true);
		} catch {
			// Starts in the normal list.
		}
		// The browser drops the wake lock when the app goes to the background.
		const again = () => shopMode && document.visibilityState === 'visible' && keepAwake();
		document.addEventListener('visibilitychange', again);
		return () => {
			document.removeEventListener('visibilitychange', again);
			wakeLock?.release().catch(() => {});
		};
	});

	// "Rückgängig" after deleting, for a few seconds.
	let undo = $state<{ name: string; quantity: string; done: boolean; createdBy: string } | null>(
		null
	);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	function offerUndo(deleted: typeof undo) {
		clearTimeout(undoTimer);
		undo = deleted;
		undoTimer = setTimeout(() => (undo = null), 6000);
	}
	const deleteEnhance =
		() =>
		async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			await update();
			if (result.type === 'success' && result.data?.deleted) {
				offerUndo(result.data.deleted as NonNullable<typeof undo>);
			}
		};

	// The order of sections, as the family walks through their store.
	let orderDialog = $state<HTMLDialogElement>();
	let draftOrder = $state<CategoryId[]>([]);
	function editOrder() {
		draftOrder = sections.map((c) => c.id);
		orderDialog?.showModal();
	}
	function move(index: number, by: number) {
		const next = [...draftOrder];
		const [id] = next.splice(index, 1);
		next.splice(index + by, 0, id);
		draftOrder = next;
	}
	const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

	type Tip = {
		date: string;
		stores: string[];
		covered: number;
		open: number;
		total: number;
		priced: number;
		configured: boolean;
		failed: boolean;
	};

	// The trip card shows one line; tapping it opens offers and planning.
	let tripOpen = $state(false);
	// Planning a trip: the tip for the chosen day shows before it is saved.
	let pickedDay = $state('');
	let preview = $state<Tip | null>(null);
	let loadingTip = $state(false);
	async function loadTip(date: string) {
		pickedDay = date;
		preview = null;
		if (!date) return;
		loadingTip = true;
		try {
			const res = await fetch(`/einkauf/tipp?datum=${encodeURIComponent(date)}`);
			const tip = res.ok ? ((await res.json()) as Tip) : null;
			if (pickedDay === date) preview = tip;
		} catch {
			// The tip is a nice extra; planning works without it.
		} finally {
			if (pickedDay === date) loadingTip = false;
		}
	}
	$effect(() => {
		if (tripOpen) untrack(() => loadTip(data.plan?.date ?? suggestedDay));
	});
	const storeList = (stores: string[]) => stores.map(storeLabel).join(' + ');
	// Most families shop on Saturday: suggest the next one.
	let suggestedDay = $derived.by(() => {
		const weekday = new Date(`${data.today}T00:00:00Z`).getUTCDay();
		return addDays(data.today, weekday === 6 ? 7 : 6 - weekday);
	});

	/** The done item whose price is being entered. */
	let pricing = $state<string | null>(null);

	// An entry's details in a pop-up: edit it, see all offers and known prices with their source.
	let dialog = $state<HTMLDialogElement>();
	let detailsId = $state<string | null>(null);
	let detailsItem = $derived(data.items.find((i) => i.id === detailsId));
	let saved = $state(false);
	function showDetails(id: string) {
		detailsId = id;
		saved = false;
		dialog?.showModal();
	}
</script>

<svelte:head><title>Einkauf · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<h1 class="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">Einkauf</h1>
	<a
		href="/einkauf/kassenzettel"
		class="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-300 px-3 text-sm font-medium whitespace-nowrap text-slate-700"
		><ReceiptText size={16} aria-hidden="true" />
		<span class="max-[379px]:sr-only">Kassenzettel</span></a
	>
	<button
		type="button"
		class="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap {shopMode
			? 'bg-brand-600 text-white'
			: 'border border-slate-300 text-slate-700'}"
		aria-pressed={shopMode}
		onclick={() => setShopMode(!shopMode)}
		><Store size={16} aria-hidden="true" /> {shopMode ? 'Fertig' : 'Im Laden'}</button
	>
</div>
{#if shopMode}
	<p class="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
		Einkaufsmodus: Abhaken per Tipp, der Bildschirm bleibt an.
	</p>
{/if}

{#if !shopMode}{@render tripCard()}{/if}

{#if suggestions.length && !shopMode}
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

<form
	method="POST"
	action="?/add"
	class="card mb-5 flex gap-2 p-3"
	use:enhance={({ formData, formElement, cancel }) => {
		// Without a connection the entry waits on the phone and is sent later.
		if (!navigator.onLine) {
			cancel();
			sendOrQueue('add', {
				name: String(formData.get('name') ?? ''),
				quantity: String(formData.get('quantity') ?? '')
			}).then(() => (queue = readQueue()));
			formElement.reset();
			return;
		}
		return async ({ update }) => {
			await update({ reset: true });
			document.querySelector<HTMLInputElement>('#new-item')?.focus();
		};
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

{#if data.items.length === 0 && !pendingAdds.length}
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
		<div class="flex items-center gap-3 {shopMode ? 'py-2 text-lg' : 'py-1'}">
			<button
				type="button"
				onclick={() => toggle(item)}
				class="flex min-h-12 items-center"
				aria-label={item.done ? `${item.name} wieder offen` : `${item.name} abhaken`}
			>
				<span
					class="flex {shopMode
						? 'size-8'
						: 'size-6'} shrink-0 items-center justify-center rounded-full border-2 {item.done
						? 'border-brand-600 bg-brand-600 text-white'
						: 'border-slate-300'}"
					aria-hidden="true"
					>{#if item.done}<Check size={15} strokeWidth={3} />{/if}</span
				>
			</button>
			<div class="min-w-0 flex-1 py-1">
				<button
					type="button"
					class="block w-full text-left"
					aria-label="Details zu {item.name}"
					onclick={() => showDetails(item.id)}
				>
					<span class={item.done ? 'text-slate-400 line-through' : ''}>{item.name}</span>
					{#if item.quantity}<span class="ml-1 text-sm text-slate-500">{item.quantity}</span>{/if}
				</button>
				{#if !item.done && !shopMode}
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
				{#if item.createdBy && !shopMode}
					<span class="flex items-center gap-1.5 text-xs text-slate-500"
						><PersonDot name={item.createdBy} size={7} />von {item.createdBy}</span
					>
				{/if}
			</div>
			{#if !item.done && !shopMode}
				{#await data.offers then offers}
					{@const cost = offers.cost.perItem[item.id]}
					{#if cost}
						<span class="shrink-0 text-right text-sm text-slate-600 tabular-nums">
							{formatPrice(cost.price * cost.packs)}
						</span>
					{/if}
				{/await}
			{/if}
			{#if item.done && !shopMode}
				<button
					class="icon-btn"
					aria-label="Preis für {item.name} eintragen"
					aria-expanded={pricing === item.id}
					onclick={() => (pricing = pricing === item.id ? null : item.id)}
					><Euro size={18} aria-hidden="true" /></button
				>
			{/if}
			{#if !shopMode}
				<form method="POST" action="?/delete" use:enhance={deleteEnhance}>
					<input type="hidden" name="id" value={item.id} />
					<button class="icon-btn" aria-label="{item.name} löschen"
						><X size={18} aria-hidden="true" /></button
					>
				</form>
			{/if}
		</div>
		{#if pricing === item.id && detailsId !== item.id}{@render priceForm(item)}{/if}
	</li>
{/snippet}

{#snippet tripCard()}
	<section class="card mb-5 text-sm" aria-label="Einkauf">
		<button
			type="button"
			class="flex w-full items-center gap-3 p-3 text-left"
			aria-expanded={tripOpen}
			onclick={() => (tripOpen = !tripOpen)}
		>
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600"
				aria-hidden="true"><CalendarDays size={18} strokeWidth={1.75} /></span
			>
			<span class="min-w-0 flex-1 font-medium">
				{#if data.plan}Einkauf am {shortDayLabel(data.plan.date)}{:else}Kein Einkauf geplant{/if}{#if open.length}{#await data.offers then offers}{#if offers.best}{data.plan
								? ' im '
								: ' · Tipp: '}{storeList(offers.best.stores)}{/if}{/await}{/if}
			</span>
			{#if open.length}
				{#await data.offers then offers}
					{#if offers.questions.length}
						<span
							class="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700"
							aria-label="{offers.questions.length} Rückfragen">{offers.questions.length}</span
						>
					{/if}
				{/await}
			{/if}
			<ChevronRight
				size={18}
				class="shrink-0 text-slate-400 transition-transform {tripOpen ? 'rotate-90' : ''}"
				aria-hidden="true"
			/>
		</button>

		{#if tripOpen}
			<div class="space-y-3 border-t border-slate-100 p-3">
				{#if open.length}
					{#await data.offers}
						<p class="flex items-center gap-2 text-slate-500">
							<Tag size={16} aria-hidden="true" /> Suche Angebote …
						</p>
					{:then offers}
						<div>
							{#if !offers.configured}
								<p class="font-medium">Wo kaufst du ein?</p>
								<p class="text-slate-500">Märkte wählen, um passende Angebote zu sehen</p>
							{:else if offers.best}
								<p>
									<Tag size={14} class="mr-1 inline text-accent-600" aria-hidden="true" />
									{offers.best.covered} von {open.length}
									{open.length === 1 ? 'Artikel' : 'Artikeln'} bei {storeList(offers.best.stores)}
									im Angebot{data.plan ? '' : ' (diese Woche)'}
								</p>
							{:else}
								<p class="font-medium">
									Keine passenden Angebote {data.plan ? 'an diesem Tag' : 'diese Woche'}
								</p>
								<p class="text-slate-500">Angebot eintragen oder Märkte ändern</p>
							{/if}
							{#if offers.configured && offers.next && !data.plan}
								<p class="mt-1 text-xs text-slate-500">
									Nächste Woche: {storeList(offers.next.stores)} ({offers.next.covered} von {open.length})
								</p>
							{/if}
							{#if offers.questions.length}
								<p class="mt-1 text-xs font-medium text-accent-700">
									{offers.questions.length}
									{offers.questions.length === 1 ? 'Rückfrage' : 'Rückfragen'}: Was meinst du genau?
								</p>
							{/if}
							{#if offers.failed}
								<p class="mt-1 text-xs text-accent-700">
									Automatische Angebote gerade nicht erreichbar.
								</p>
							{/if}
						</div>
					{:catch}
						<p class="text-slate-500">Angebote konnten nicht geladen werden.</p>
					{/await}
				{/if}

				<div class="rounded-xl bg-slate-50 p-3">
					<form
						method="POST"
						action="?/plan"
						class="flex items-end gap-2"
						use:enhance={() =>
							async ({ result, update }) => {
								await update({ reset: false });
								if (result.type === 'success') preview = null;
							}}
					>
						<label class="min-w-0 flex-1">
							<span class="label"
								>{data.plan ? 'Einkauf verschieben' : 'Wann wird eingekauft?'}</span
							>
							<input
								type="date"
								name="date"
								required
								min={data.today}
								max={addDays(data.today, 60)}
								value={pickedDay}
								onchange={(e) => loadTip(e.currentTarget.value)}
								class="w-full"
							/>
						</label>
						<button class="btn-primary">{data.plan ? 'Verschieben' : 'Planen'}</button>
					</form>
					<p class="mt-2" aria-live="polite">
						{#if loadingTip}
							<span class="text-slate-500">Suche den passenden Markt …</span>
						{:else if preview && preview.date !== data.plan?.date}
							{#if preview.stores.length}
								Vorschlag für {shortDate(preview.date)}:
								<strong>{storeList(preview.stores)}</strong>
								<span class="text-slate-500"
									>({preview.covered} von {preview.open} im Angebot{#if preview.priced}, ≈ {formatPrice(
											preview.total
										)}{/if})</span
								>
							{:else if !preview.configured}
								{#if !open.length}<span class="text-slate-500"
										>Wähle deine Märkte unter „Alle Angebote“.</span
									>{/if}
							{:else}
								<span class="text-slate-500">Keine passenden Angebote an diesem Tag.</span>
							{/if}
						{/if}
					</p>
					<p class="mt-1 text-xs text-slate-500">Alle sehen den Einkauf als Aufgabe im Kalender.</p>
					{#if data.plan}
						<form method="POST" action="?/unplan" use:enhance>
							<button class="mt-2 text-sm text-slate-500 underline">Einkauf absagen</button>
						</form>
					{/if}
				</div>

				<a
					href="/einkauf/angebote"
					class="flex min-h-9 items-center justify-end gap-1 font-medium text-brand-700"
					>Alle Angebote <ChevronRight size={16} aria-hidden="true" /></a
				>
			</div>
		{/if}
	</section>
{/snippet}

{#snippet priceForm(item: (typeof data.items)[number])}
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
{/snippet}

{#if open.length}
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
					{#each group.pending as p (p.id)}
						<li
							class="flex min-h-12 items-center gap-3 border-b border-slate-100 py-1 last:border-0"
						>
							<span
								class="flex size-6 items-center justify-center text-slate-400"
								aria-hidden="true"><Clock size={18} /></span
							>
							<span class="min-w-0 flex-1">
								{p.name}
								{#if p.quantity}<span class="ml-1 text-sm text-slate-500">{p.quantity}</span>{/if}
								<span class="block text-xs text-slate-500"
									>wird gesendet, sobald du online bist</span
								>
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		<button
			type="button"
			class="block w-full text-center text-sm text-slate-500 underline"
			onclick={editOrder}
		>
			Reihenfolge der Bereiche anpassen
		</button>
	</div>
	{#if !shopMode}
		{#await data.offers then offers}
			<section class="card mt-4 p-4" aria-label="Voraussichtlicher Preis">
				<div class="flex items-baseline justify-between gap-3">
					<span class="font-semibold">Voraussichtlich</span>
					<span class="text-xl font-semibold tabular-nums">
						{offers.cost.priced ? `≈ ${formatPrice(offers.cost.total)}` : '–'}
					</span>
				</div>
				<p class="mt-1 text-xs text-slate-500">
					{#if offers.cost.priced === open.length}
						Alle {open.length} Artikel mit Preis{data.plan
							? `, Angebote vom ${shortDate(data.plan.date)}`
							: ''}.
					{:else}
						{offers.cost.priced} von {open.length} Artikeln mit Preis. Fehlende Preise lernt MyFam vom
						<a href="/einkauf/kassenzettel" class="underline">Kassenzettel</a>.
					{/if}
				</p>
			</section>
		{/await}
	{/if}
{:else if pendingAdds.length}
	<div class="space-y-4">
		{#each groups as group (group.id)}
			<section aria-label={group.label}>
				<h2 class="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-500">
					<CategoryIcon category={group.id} />
					{group.label}
				</h2>
				<ul class="card px-3">
					{#each group.pending as p (p.id)}
						<li
							class="flex min-h-12 items-center gap-3 border-b border-slate-100 py-1 last:border-0"
						>
							<span
								class="flex size-6 items-center justify-center text-slate-400"
								aria-hidden="true"><Clock size={18} /></span
							>
							<span class="min-w-0 flex-1">
								{p.name}
								<span class="block text-xs text-slate-500"
									>wird gesendet, sobald du online bist</span
								>
							</span>
						</li>
					{/each}
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
		{#if !shopMode}
			<form method="POST" action="?/clearDone" use:enhance>
				<button class="text-sm text-slate-500 underline">Erledigte löschen</button>
			</form>
		{/if}
	</div>
	<ul class="card px-3">
		{#each done as item (item.id)}{@render row(item)}{/each}
	</ul>
{/if}

<dialog
	bind:this={dialog}
	class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl bg-surface p-0 text-slate-900 shadow-xl backdrop:bg-black/40"
	onclose={() => {
		if (pricing === detailsId) pricing = null;
		detailsId = null;
	}}
>
	{#if detailsItem}
		<div class="max-h-[85dvh] overflow-y-auto p-4">
			<div class="mb-3 flex items-start justify-between gap-2">
				<h2 class="text-lg font-semibold">
					{detailsItem.name}
					{#if detailsItem.done}<span class="ml-1 text-sm font-normal text-slate-500">erledigt</span
						>{/if}
				</h2>
				<button class="icon-btn -mt-2 -mr-2" aria-label="Schließen" onclick={() => dialog?.close()}
					><X size={18} aria-hidden="true" /></button
				>
			</div>
			{#key detailsItem.id}
				<form
					method="POST"
					action="?/edit"
					class="mb-1 flex gap-2"
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							saved = result.type === 'success';
						}}
				>
					<input type="hidden" name="id" value={detailsItem.id} />
					<label class="min-w-0 flex-1">
						<span class="label">Artikel</span>
						<input name="name" value={detailsItem.name} required maxlength="100" class="w-full" />
					</label>
					<label class="w-24">
						<span class="label">Menge</span>
						<input
							name="quantity"
							value={detailsItem.quantity ?? ''}
							maxlength="30"
							class="w-full"
						/>
					</label>
					<button class="btn-primary self-end px-3" aria-label="Speichern"
						><Check size={20} aria-hidden="true" /></button
					>
				</form>
			{/key}
			<p class="mb-3 min-h-5 text-sm" aria-live="polite">
				{#if saved}<span class="text-brand-700">Gespeichert.</span>{:else if form?.message}<span
						class="error">{form.message}</span
					>{/if}
			</p>
			<form method="POST" action="?/category" use:enhance class="mb-2">
				<input type="hidden" name="name" value={detailsItem.name} />
				<label>
					<span class="label">Bereich</span>
					<select
						name="category"
						class="w-full"
						value={detailsItem.category}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						{#each CATEGORIES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
					</select>
				</label>
			</form>
			{#if detailsItem.createdBy}
				<p class="mb-4 text-xs text-slate-500">Eingetragen von {detailsItem.createdBy}</p>
			{/if}
			{#await data.offers then offers}
				{@const list = offers.byItem[detailsItem.id] ?? []}
				{@const cost = offers.cost.perItem[detailsItem.id]}
				{#if list.length}
					<h3 class="text-sm font-semibold text-slate-500">Angebote</h3>
					<ul class="mb-4">
						{#each list as o, i (i)}
							<li class="border-b border-slate-100 py-2 text-sm last:border-0">
								{#if o.image}
									<img
										src={o.image}
										alt=""
										loading="lazy"
										class="mb-2 max-h-40 rounded-lg bg-white object-contain"
										onerror={(e) => e.currentTarget.remove()}
									/>
								{/if}
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
			<div class="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
				<button
					type="button"
					class="flex min-h-10 items-center gap-1 text-sm text-slate-600 underline"
					aria-expanded={pricing === detailsItem.id}
					onclick={() => (pricing = pricing === detailsId ? null : detailsId)}
					><Euro size={16} aria-hidden="true" /> Preis eintragen</button
				>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() =>
						async ({ result, update }) => {
							dialog?.close();
							await deleteEnhance()({ result, update });
						}}
				>
					<input type="hidden" name="id" value={detailsItem.id} />
					<button class="min-h-10 text-sm text-red-700 underline">Eintrag löschen</button>
				</form>
			</div>
			{#if pricing === detailsItem.id}{@render priceForm(detailsItem)}{/if}
		</div>
	{/if}
</dialog>

<dialog
	bind:this={orderDialog}
	class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl bg-surface p-0 text-slate-900 shadow-xl backdrop:bg-black/40"
>
	<form
		method="POST"
		action="?/order"
		class="max-h-[85dvh] overflow-y-auto p-4"
		use:enhance={() =>
			async ({ update }) => {
				await update();
				orderDialog?.close();
			}}
	>
		<div class="mb-1 flex items-start justify-between gap-2">
			<h2 class="text-lg font-semibold">Reihenfolge der Bereiche</h2>
			<button
				type="button"
				class="icon-btn -mt-2 -mr-2"
				aria-label="Schließen"
				onclick={() => orderDialog?.close()}><X size={18} aria-hidden="true" /></button
			>
		</div>
		<p class="mb-3 text-sm text-slate-500">
			So, wie ihr durch euren Markt geht. Gilt für die ganze Familie.
		</p>
		<ol class="mb-4">
			{#each draftOrder as id, i (id)}
				<li class="flex items-center gap-2 border-b border-slate-100 py-1 last:border-0">
					<input type="hidden" name="order" value={id} />
					<CategoryIcon category={id} />
					<span class="flex-1 text-sm">{label(id)}</span>
					<button
						type="button"
						class="icon-btn size-9"
						aria-label="{label(id)} nach oben"
						disabled={i === 0}
						onclick={() => move(i, -1)}><ArrowUp size={18} /></button
					>
					<button
						type="button"
						class="icon-btn size-9"
						aria-label="{label(id)} nach unten"
						disabled={i === draftOrder.length - 1}
						onclick={() => move(i, 1)}><ArrowDown size={18} /></button
					>
				</li>
			{/each}
		</ol>
		<div class="grid grid-cols-2 gap-2">
			<button name="reset" value="1" class="btn-secondary">Standard</button>
			<button class="btn-primary">Speichern</button>
		</div>
	</form>
</dialog>

{#if undo}
	<div
		class="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-[min(100%-2rem,26rem)] items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg"
		role="status"
	>
		<span class="min-w-0 flex-1 truncate">„{undo.name}“ gelöscht</span>
		<form
			method="POST"
			action="?/restore"
			use:enhance={() => {
				clearTimeout(undoTimer);
				undo = null;
				return async ({ update }) => update();
			}}
		>
			<input type="hidden" name="name" value={undo.name} />
			<input type="hidden" name="quantity" value={undo.quantity} />
			<input type="hidden" name="done" value={String(undo.done)} />
			<input type="hidden" name="createdBy" value={undo.createdBy} />
			<button class="font-semibold text-brand-300">Rückgängig</button>
		</form>
	</div>
{/if}
