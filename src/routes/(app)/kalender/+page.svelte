<script lang="ts">
	import {
		CalendarSync,
		ChevronLeft,
		ChevronRight,
		ListTodo,
		PartyPopper,
		Plus,
		UtensilsCrossed
	} from '@lucide/svelte';
	import { addMonths, dayLabel, monthLabel, shortDate, weekStart } from '$lib/dates';
	import { visibilityLabel } from '$lib/visibility';
	import { colorOf } from '$lib/subscriptions';
	import VisibilityIcon from '$lib/components/VisibilityIcon.svelte';
	import MealDay from '$lib/components/MealDay.svelte';
	import MealDishes from '$lib/components/MealDishes.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Picking a day happens in the browser. It survives the regular refresh of the data,
	// and a new month falls back to the day the server chose.
	let picked = $state<string | null>(null);
	let selected = $derived(picked?.startsWith(data.month) ? picked : data.selected);

	const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

	let holidayByDate = $derived(new Map(data.holidays.map((h) => [h.date, h.name])));

	function eventsOn(date: string) {
		return data.events.filter((e) => e.startDate <= date && e.endDate >= date);
	}

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

	let selectedEvents = $derived(eventsOn(selected));

	function openTasksOn(date: string) {
		return data.tasks.filter((t) => t.dueDate === date && !t.done);
	}

	// Today also lists what is still open from earlier days.
	let selectedTasks = $derived([
		...(selected === data.today ? data.overdue : []),
		...data.tasks.filter((t) => t.dueDate === selected)
	]);
</script>

<svelte:head><title>Kalender · MyFam</title></svelte:head>

<MealDishes id="dishes" dishes={data.dishes} />

<div class="mb-3 flex items-center gap-2">
	<h1 class="flex-1 text-xl font-semibold tracking-tight">{monthLabel(data.month)}</h1>
	<a
		href="?monat={addMonths(data.month, -1)}"
		class="btn-secondary flex w-11 items-center justify-center px-0"
		aria-label="Vorheriger Monat"
		data-sveltekit-noscroll><ChevronLeft size={20} aria-hidden="true" /></a
	>
	{#if !data.today.startsWith(data.month)}
		<a
			href="?monat={data.today.slice(0, 7)}"
			class="btn-secondary px-3 text-sm"
			data-sveltekit-noscroll>Heute</a
		>
	{/if}
	<a
		href="?monat={addMonths(data.month, 1)}"
		class="btn-secondary flex w-11 items-center justify-center px-0"
		aria-label="Nächster Monat"
		data-sveltekit-noscroll><ChevronRight size={20} aria-hidden="true" /></a
	>
</div>

<div class="card p-2">
	<div class="grid grid-cols-7 text-center text-xs font-medium text-slate-500">
		{#each weekdays as w (w)}<div class="py-1">{w}</div>{/each}
	</div>
	<div class="grid grid-cols-7">
		{#each data.days as date (date)}
			{@const inMonth = date.startsWith(data.month)}
			{@const holiday = holidayByDate.get(date)}
			{@const dayEvents = eventsOn(date)}
			{@const dayTasks = openTasksOn(date)}
			{@const count = dayEvents.length + dayTasks.length}
			{@const isSelected = date === selected}
			{@const isToday = date === data.today}
			<button
				type="button"
				onclick={() => (picked = date)}
				class="flex h-12 flex-col items-center justify-start gap-0.5 rounded-lg pt-1 {isSelected
					? 'bg-brand-600 text-white'
					: ''} {!inMonth && !isSelected ? 'text-slate-300' : ''}"
				aria-pressed={isSelected}
				aria-label="{dayLabel(date)}{holiday ? `, ${holiday}` : ''}{count
					? `, ${count} Eintr${count === 1 ? 'ag' : 'äge'}`
					: ''}"
			>
				<span
					class="flex size-7 items-center justify-center rounded-full text-sm {isToday &&
					!isSelected
						? 'font-bold text-brand-700 ring-1 ring-brand-600'
						: ''} {holiday && !isSelected && inMonth ? 'font-semibold text-accent-600' : ''}"
					>{Number(date.slice(8))}</span
				>
				<span class="flex h-1.5 gap-0.5" aria-hidden="true">
					{#each dayEvents.slice(0, 3) as e (e.id)}
						<span
							class="size-1.5 rounded-full {isSelected
								? 'bg-white'
								: e.color
									? colorOf(e.color).dot
									: 'bg-brand-600'}"
						></span>
					{/each}
					<!-- Open tasks are hollow dots, after the events. -->
					{#each dayTasks.slice(0, Math.max(0, 3 - dayEvents.length)) as t (t.id)}
						<span
							class="size-1.5 rounded-full border {isSelected
								? 'border-white'
								: 'border-brand-600'}"
						></span>
					{/each}
				</span>
			</button>
		{/each}
	</div>
</div>

<section class="mt-5">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="font-semibold">{dayLabel(selected)}</h2>
		<a href="/kalender/neu?datum={selected}" class="btn-primary px-3 py-1 text-sm"
			><Plus size={18} aria-hidden="true" /> Termin</a
		>
	</div>

	{#if holidayByDate.get(selected)}
		<p
			class="mb-2 flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-700"
		>
			<PartyPopper size={18} aria-hidden="true" />
			{holidayByDate.get(selected)} (Feiertag)
		</p>
	{/if}

	<div class="card mb-3 px-2 pt-2">
		<div class="flex items-center justify-between px-1">
			<h3 class="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
				<ListTodo size={16} aria-hidden="true" /> Aufgaben
			</h3>
			<span class="flex items-center gap-3 text-sm">
				<a href="/kalender/aufgaben" class="text-brand-700">Alle</a>
				<a
					href="/kalender/aufgaben/neu?datum={selected}"
					class="icon-btn size-8 text-brand-700"
					aria-label="Aufgabe für diesen Tag"><Plus size={18} /></a
				>
			</span>
		</div>
		{#if selectedTasks.length}
			<ul>
				{#each selectedTasks as task (task.id)}
					<TaskRow {task} today={data.today} />
				{/each}
			</ul>
		{:else}
			<p class="px-1 pb-3 text-sm text-slate-400">Nichts zu erledigen.</p>
		{/if}
	</div>

	<div class="card mb-3 px-3 pt-2">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
				<UtensilsCrossed size={16} aria-hidden="true" /> Essen
			</h3>
			<a href="/kalender/essen?woche={weekStart(selected)}" class="text-sm text-brand-700"
				>Woche planen</a
			>
		</div>
		{#key selected}
			<MealDay
				date={selected}
				meals={data.meals.filter((m) => m.date === selected)}
				datalistId="dishes"
			/>
		{/key}
	</div>

	{#if selectedEvents.length}
		<ul class="card px-3">
			{#each selectedEvents as event (event.id)}
				<li class="border-b border-slate-100 last:border-0">
					<a href={event.href} class="flex min-h-14 items-center gap-3 py-2">
						<span class="w-20 shrink-0 text-sm text-slate-500">{timeOf(event, selected)}</span>
						<span class="flex-1">
							<span class="block">{event.title}</span>
							<span class="block text-xs text-slate-400">
								{#if event.startDate !== event.endDate}
									{shortDate(event.startDate)}–{shortDate(event.endDate)} ·
								{/if}
								{event.source ?? event.createdBy ?? 'Unbekannt'}
							</span>
						</span>
						{#if event.source}
							<span
								class={colorOf(event.color ?? '').text}
								title="Abo „{event.source}“"
								aria-label="Abo „{event.source}“"><CalendarSync size={20} /></span
							>
						{:else}
							<span
								class="text-slate-400"
								title={visibilityLabel[event.visibility]}
								aria-label={visibilityLabel[event.visibility]}
								><VisibilityIcon visibility={event.visibility} /></span
							>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else if !holidayByDate.get(selected)}
		<p class="py-6 text-center text-sm text-slate-500">Keine Termine an diesem Tag.</p>
	{/if}
</section>

<p class="mt-6 text-center text-xs text-slate-400">
	Feiertage: {data.stateName ?? 'nur bundesweite'} ·
	<a href="/familie#feiertage" class="underline">ändern</a> ·
	<a href="/kalender/abos" class="underline">Kalender-Abos</a>
</p>
