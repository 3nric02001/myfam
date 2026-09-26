<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		CalendarDays,
		CalendarSync,
		Check,
		CheckCheck,
		ChevronRight,
		ListTodo,
		Repeat,
		ShoppingCart,
		UtensilsCrossed,
		MessageCircle,
		PartyPopper,
		Pencil,
		Plus,
		Sparkles,
		StickyNote,
		X
	} from '@lucide/svelte';
	import { dayLabel } from '$lib/dates';
	import { visibilityLabel } from '$lib/visibility';
	import { colorOf } from '$lib/subscriptions';
	import VisibilityIcon from '$lib/components/VisibilityIcon.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import PersonDot from '$lib/components/PersonDot.svelte';
	import { mealSlotLabel } from '$lib/meals';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// First steps. Whether the app runs from the home screen is only known in the browser.
	let installed = $state(true);
	let setupHidden = $state(true);
	onMount(() => {
		installed =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as { standalone?: boolean }).standalone === true;
		try {
			setupHidden = localStorage.getItem('setup-hidden') === '1';
		} catch {
			setupHidden = false;
		}
	});
	let steps = $derived([
		{ done: data.setup.invited, label: 'Familie einladen', href: '/familie' },
		{ done: installed, label: 'Zum Home-Bildschirm hinzufügen', href: null },
		{ done: data.setup.push, label: 'Erinnerungen einschalten', href: '/einstellungen' },
		{ done: data.setup.stores, label: 'Märkte für Angebote wählen', href: '/einkauf/angebote' }
	]);
	let stepsLeft = $derived(steps.filter((s) => !s.done).length);
	let showInstallHelp = $state(false);
	function hideSetup() {
		setupHidden = true;
		try {
			localStorage.setItem('setup-hidden', '1');
		} catch {
			// Stays hidden until the page is reloaded.
		}
	}

	let days = $derived(
		[
			{ date: data.today, title: 'Heute' },
			{ date: data.tomorrow, title: 'Morgen' }
		].map((d) => ({
			...d,
			holiday: data.holidays.find((h) => h.date === d.date)?.name ?? null,
			events: data.events.filter((e) => e.startDate <= d.date && e.endDate >= d.date)
		}))
	);

	function timeOf(event: (typeof data.events)[number], date: string) {
		if (!event.startTime) return 'ganztägig';
		const starts = event.startDate === date;
		const ends = event.endDate === date;
		if (starts && ends)
			return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
		if (starts) return `ab ${event.startTime}`;
		if (ends) return event.endTime ? `bis ${event.endTime}` : 'ganztägig';
		return 'ganztägig';
	}

	let dueNow = $derived(data.tasks.filter((t) => t.dueDate <= data.today));
	let dueSoon = $derived(data.tasks.filter((t) => t.dueDate > data.today));

	const time = new Intl.DateTimeFormat('de-DE', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Berlin'
	});
	const date = new Intl.DateTimeFormat('de-DE', {
		day: 'numeric',
		month: 'numeric',
		timeZone: 'Europe/Berlin'
	});
	function when(at: Date) {
		const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(at);
		return day === data.today ? time.format(at) : date.format(at);
	}
</script>

<svelte:head><title>Dashboard · MyFam</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">Hallo {data.userName}</h1>
<p class="mb-4 text-sm text-slate-500">{dayLabel(data.today)}</p>

{#if stepsLeft && !setupHidden}
	<section class="card mb-4 p-3" aria-labelledby="erste-schritte">
		<div class="flex items-center justify-between">
			<h2 id="erste-schritte" class="px-1 font-semibold">Erste Schritte</h2>
			<button
				type="button"
				class="icon-btn size-9 text-slate-400"
				aria-label="Erste Schritte ausblenden"
				onclick={hideSetup}><X size={18} /></button
			>
		</div>
		<ul>
			{#each steps as step (step.label)}
				<li class="border-b border-slate-100 last:border-0">
					{#if step.done}
						<span class="flex min-h-11 items-center gap-3 px-1 text-slate-400 line-through">
							<span
								class="flex size-5 items-center justify-center rounded-full bg-brand-600 text-white"
								aria-hidden="true"><Check size={13} strokeWidth={3} /></span
							>
							{step.label}
						</span>
					{:else if step.href}
						<a href={step.href} class="flex min-h-11 items-center gap-3 px-1">
							<span class="size-5 rounded-full border-2 border-slate-300" aria-hidden="true"></span>
							<span class="flex-1">{step.label}</span>
							<ChevronRight size={18} class="text-slate-400" aria-hidden="true" />
						</a>
					{:else}
						<button
							type="button"
							class="flex min-h-11 w-full items-center gap-3 px-1 text-left"
							aria-expanded={showInstallHelp}
							onclick={() => (showInstallHelp = !showInstallHelp)}
						>
							<span class="size-5 rounded-full border-2 border-slate-300" aria-hidden="true"></span>
							<span class="flex-1">{step.label}</span>
							<ChevronRight
								size={18}
								class="text-slate-400 transition-transform {showInstallHelp ? 'rotate-90' : ''}"
								aria-hidden="true"
							/>
						</button>
						{#if showInstallHelp}
							<p class="px-1 pb-3 pl-9 text-sm text-slate-500">
								In Safari unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach MyFam über das
								neue Symbol öffnen. So klappen auch Erinnerungen.
							</p>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="card mb-4 px-3 pt-2 pb-1" aria-labelledby="termine">
	<div class="flex items-center justify-between">
		<h2 id="termine" class="flex items-center gap-1.5 font-semibold">
			<CalendarDays size={18} class="text-brand-700" aria-hidden="true" /> Termine
		</h2>
		<a href="/kalender" class="text-sm text-brand-700">Kalender</a>
	</div>
	{#if days.every((d) => !d.events.length && !d.holiday)}
		<p class="py-2 text-sm text-slate-400">Heute und morgen keine Termine.</p>
	{:else}
		{#each days as day (day.date)}
			<h3 class="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
				{day.title}
			</h3>
			{#if day.holiday}
				<p
					class="my-1 flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-1.5 text-sm text-accent-700"
				>
					<PartyPopper size={16} aria-hidden="true" />
					{day.holiday}
				</p>
			{/if}
			{#if day.events.length}
				<ul>
					{#each day.events as event (event.key)}
						<li class="border-b border-slate-100 last:border-0">
							<a href={event.href} class="flex min-h-12 items-center gap-3 py-1.5">
								<span class="w-24 shrink-0 text-sm whitespace-nowrap text-slate-500"
									>{timeOf(event, day.date)}</span
								>
								<span class="min-w-0 flex-1">
									<span class="flex items-center gap-1.5 truncate">
										{#if !event.source}<PersonDot id={event.createdById} />{/if}
										<span class="truncate">{event.title}</span>
										{#if event.repeat}<Repeat
												size={13}
												class="shrink-0 text-slate-400"
												aria-label="wiederholt sich"
											/>{/if}
									</span>
									{#if event.source}
										<span class="block truncate text-xs text-slate-400">{event.source}</span>
									{/if}
								</span>
								{#if event.source}
									<span class={colorOf(event.color ?? '').text} aria-label="Abo „{event.source}“"
										><CalendarSync size={18} /></span
									>
								{:else if event.visibility !== 'family'}
									<span class="text-slate-400" aria-label={visibilityLabel[event.visibility]}
										><VisibilityIcon visibility={event.visibility} size={18} /></span
									>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="py-2 text-sm text-slate-400">Keine Termine.</p>
			{/if}
		{/each}
	{/if}
</section>

<div class="mb-4 grid grid-cols-2 gap-3">
	<a href="/einkauf" class="card flex flex-col gap-1 p-3" aria-label="Einkaufsliste">
		<span class="flex items-center gap-1.5 text-sm font-semibold">
			<ShoppingCart size={16} class="text-brand-700" aria-hidden="true" /> Einkauf
		</span>
		<span class="text-2xl font-semibold tabular-nums"
			>{data.shopping.open}<span class="ml-1 text-sm font-normal text-slate-500">Artikel offen</span
			></span
		>
		<span class="text-xs text-slate-500">
			{data.shopping.planned
				? data.shopping.planned === data.today
					? 'Einkauf heute'
					: `Einkauf am ${dayLabel(data.shopping.planned).replace(/, .*/, '')}`
				: 'Kein Einkauf geplant'}
		</span>
	</a>
	<a href="/kalender/essen" class="card flex flex-col gap-1 p-3" aria-label="Essen heute">
		<span class="flex items-center gap-1.5 text-sm font-semibold">
			<UtensilsCrossed size={16} class="text-brand-700" aria-hidden="true" /> Essen heute
		</span>
		{#if data.meals.length}
			<ul class="space-y-0.5 text-sm">
				{#each data.meals as meal (meal.id)}
					<li class="truncate">
						<span class="text-xs text-slate-500">{mealSlotLabel[meal.slot]}:</span>
						{meal.name}
					</li>
				{/each}
			</ul>
		{:else}
			<span class="text-sm text-slate-500">Noch nichts geplant</span>
			<span class="text-xs font-medium text-brand-700">Jetzt planen</span>
		{/if}
	</a>
</div>

<section class="card mb-4 px-2 pt-2" aria-labelledby="aufgaben">
	<div class="flex items-center justify-between px-1">
		<h2 id="aufgaben" class="flex items-center gap-1.5 font-semibold">
			<ListTodo size={18} class="text-brand-700" aria-hidden="true" /> Meine Aufgaben
		</h2>
		<span class="flex items-center gap-3 text-sm">
			<a href="/kalender/aufgaben?filter=meine" class="text-brand-700">Alle</a>
			<a
				href="/kalender/aufgaben/neu?datum={data.today}"
				class="icon-btn size-8 text-brand-700"
				aria-label="Neue Aufgabe"><Plus size={18} /></a
			>
		</span>
	</div>
	{#if dueNow.length}
		<ul>
			{#each dueNow as task (task.id)}
				<TaskRow {task} today={data.today} />
			{/each}
		</ul>
	{:else}
		<p class="px-1 py-2 text-sm text-slate-400">Heute ist nichts fällig.</p>
	{/if}
	{#if dueSoon.length}
		<h3 class="mt-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
			Nächste 7 Tage
		</h3>
		<ul>
			{#each dueSoon as task (task.id)}
				<TaskRow {task} today={data.today} showDue />
			{/each}
		</ul>
	{/if}
	{#if data.laterTasks}
		<p class="px-1 pb-2 text-xs text-slate-400">
			+ {data.laterTasks} später fällig
		</p>
	{/if}
	{#if !dueSoon.length && !data.laterTasks}<div class="pb-1"></div>{/if}
</section>

<section class="card mb-4 px-3 pt-2 pb-1" aria-labelledby="planung">
	<div class="flex items-center justify-between">
		<h2 id="planung" class="flex items-center gap-1.5 font-semibold">
			<StickyNote size={18} class="text-brand-700" aria-hidden="true" /> Neu in der Planung
		</h2>
		{#if data.planning.length > 1}
			<form method="POST" action="?/allSeen" use:enhance>
				<button class="flex items-center gap-1 text-sm text-brand-700"
					><CheckCheck size={16} aria-hidden="true" /> Alle gelesen</button
				>
			</form>
		{:else}
			<a href="/planung" class="text-sm text-brand-700">Planung</a>
		{/if}
	</div>
	{#if data.planning.length}
		<ul>
			{#each data.planning as item (item.id)}
				<li class="flex items-start gap-1 border-b border-slate-100 last:border-0">
					<a href="/planung/{item.folderId}/{item.id}" class="min-w-0 flex-1 py-2">
						<span class="block truncate text-xs text-slate-400">{item.folderName}</span>
						<span class="block truncate font-medium">{item.title}</span>
						<span class="mt-1 flex flex-wrap gap-1.5 text-xs">
							{#if item.isNew}
								<span
									class="flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 font-medium text-accent-700"
									><Sparkles size={12} aria-hidden="true" /> Neue Karte</span
								>
							{:else if item.changed}
								<span
									class="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600"
									><Pencil size={12} aria-hidden="true" /> Geändert</span
								>
							{/if}
							{#if item.newComments}
								<span
									class="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-800"
									><MessageCircle size={12} aria-hidden="true" />
									{item.newComments}
									{item.newComments === 1 ? 'neuer Kommentar' : 'neue Kommentare'}</span
								>
							{/if}
						</span>
						{#if item.lastComment}
							<span class="mt-1 line-clamp-2 text-sm text-slate-600">
								<span class="font-medium">{item.lastComment.author ?? 'Unbekannt'}:</span>
								{item.lastComment.text}
								<span class="text-xs text-slate-400">· {when(item.lastComment.createdAt)}</span>
							</span>
						{/if}
					</a>
					<form method="POST" action="?/seen" use:enhance class="pt-1.5">
						<input type="hidden" name="id" value={item.id} />
						<button
							class="icon-btn size-9 text-slate-400"
							aria-label="„{item.title}“ als gelesen markieren"
							title="Als gelesen markieren"><X size={18} /></button
						>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="py-2 text-sm text-slate-400">Du bist auf dem neuesten Stand.</p>
	{/if}
</section>
