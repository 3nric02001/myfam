<script lang="ts">
	import {
		CalendarDays,
		CalendarSync,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		ListTodo,
		PartyPopper,
		Plus,
		Repeat,
		UtensilsCrossed
	} from '@lucide/svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { addDays, addMonths, dayLabel, monthLabel, shortDate, weekStart } from '$lib/dates';
	import { visibilityLabel } from '$lib/visibility';
	import { colorOf } from '$lib/subscriptions';
	import VisibilityIcon from '$lib/components/VisibilityIcon.svelte';
	import MealDay from '$lib/components/MealDay.svelte';
	import MealDishes from '$lib/components/MealDishes.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import PersonDot from '$lib/components/PersonDot.svelte';
	import { colorHex } from '$lib/colors';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Picking a day happens in the browser. It survives the regular refresh of the data,
	// and a new month falls back to the day the server chose.
	let picked = $state<string | null>(null);
	let selected = $derived(picked && data.days.includes(picked) ? picked : data.selected);

	// Only the selected week is shown until the month is expanded; kept in the URL.
	let expandedLocal = $state<boolean | null>(null);
	let expanded = $derived(expandedLocal ?? data.expanded);
	let week = $derived(
		data.days.slice(
			data.days.indexOf(weekStart(selected)),
			data.days.indexOf(weekStart(selected)) + 7
		)
	);
	let visibleDays = $derived(expanded ? data.days : week);
	let viewParam = $derived(expanded ? '&ansicht=monat' : '');

	function toggleMonth() {
		expandedLocal = !expanded;
		const url = new URL(page.url);
		url.searchParams.set('tag', selected);
		url.searchParams.delete('monat');
		if (expandedLocal) url.searchParams.set('ansicht', 'monat');
		else url.searchParams.delete('ansicht');
		replaceState(url, page.state);
	}

	let showsToday = $derived(visibleDays.includes(data.today));
	let heading = $derived(expanded ? monthLabel(data.month) : weekHeading(week));

	function weekHeading(days: string[]) {
		const first = days[0].slice(0, 7);
		const last = days[6].slice(0, 7);
		if (first === last) return monthLabel(first);
		const short = (m: string) =>
			new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' }).format(
				new Date(`${m}-01T00:00:00Z`)
			);
		return `${short(first)} – ${monthLabel(last)}`;
	}

	// Own events get the colour of the person who entered them.
	let personHex = $derived(
		new Map(data.memberColors.map((m) => [m.id, colorHex(m.color)] as const))
	);

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
	<h1 class="flex-1 text-xl font-semibold tracking-tight">{heading}</h1>
</div>

<div class="card px-2 pt-2 pb-1">
	<div class="mb-1 flex items-center gap-1">
		<a
			href={expanded
				? `?monat=${addMonths(data.month, -1)}${viewParam}`
				: `?tag=${addDays(selected, -7)}`}
			class="icon-btn"
			aria-label={expanded ? 'Vorheriger Monat' : 'Vorherige Woche'}
			data-sveltekit-noscroll><ChevronLeft size={20} /></a
		>
		<div class="grid flex-1 grid-cols-7 text-center text-xs font-medium text-slate-500">
			{#each weekdays as w (w)}<div>{w}</div>{/each}
		</div>
		<a
			href={expanded
				? `?monat=${addMonths(data.month, 1)}${viewParam}`
				: `?tag=${addDays(selected, 7)}`}
			class="icon-btn"
			aria-label={expanded ? 'Nächster Monat' : 'Nächste Woche'}
			data-sveltekit-noscroll><ChevronRight size={20} /></a
		>
	</div>
	<div class="mx-11 grid grid-cols-7">
		{#each visibleDays as date (date)}
			{@const inMonth = !expanded || date.startsWith(data.month)}
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
					{#each dayEvents.slice(0, 3) as e (e.key)}
						{@const hex =
							!isSelected && !e.color && e.createdById ? personHex.get(e.createdById) : null}
						<span
							class="size-1.5 rounded-full {isSelected
								? 'bg-white'
								: e.color
									? colorOf(e.color).dot
									: hex
										? ''
										: 'bg-brand-600'}"
							style={hex ? `background: ${hex}` : undefined}
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
	<div class="flex items-center justify-center gap-4 text-sm">
		{#if !showsToday || selected !== data.today}
			<a
				href="?tag={data.today}{viewParam}"
				class="py-2 text-brand-700"
				data-sveltekit-noscroll
				onclick={() => (picked = null)}>Heute</a
			>
		{/if}
		<button
			type="button"
			class="flex items-center gap-1 py-2 text-slate-500"
			aria-expanded={expanded}
			onclick={toggleMonth}
		>
			{#if expanded}
				<ChevronUp size={16} aria-hidden="true" /> Nur Woche
			{:else}
				<ChevronDown size={16} aria-hidden="true" /> Ganzer Monat
			{/if}
		</button>
	</div>
</div>

<h2 class="mt-6 flex items-center gap-2 text-lg font-semibold">
	{dayLabel(selected)}
</h2>
{#if holidayByDate.get(selected)}
	<p class="mt-2 flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-700">
		<PartyPopper size={18} aria-hidden="true" />
		{holidayByDate.get(selected)} (Feiertag)
	</p>
{/if}

{#snippet sectionHead(Icon: typeof CalendarDays, title: string, count: number)}
	<h3 class="flex flex-1 items-center gap-2 font-semibold">
		<span class="flex size-8 items-center justify-center rounded-full bg-brand-50 text-brand-700"
			><Icon size={17} aria-hidden="true" /></span
		>
		{title}
		{#if count}<span class="text-sm font-normal text-slate-500">{count}</span>{/if}
	</h3>
{/snippet}

<section class="mt-4" aria-label="Termine">
	<div class="mb-2 flex items-center gap-2">
		{@render sectionHead(CalendarDays, 'Termine', selectedEvents.length)}
		<a
			href="/kalender/neu?datum={selected}"
			class="icon-btn size-9 text-brand-700"
			aria-label="Termin für diesen Tag"><Plus size={20} /></a
		>
	</div>
	{#if selectedEvents.length}
		<ul class="card px-3">
			{#each selectedEvents as event (event.key)}
				<li class="border-b border-slate-100 last:border-0">
					<a href={event.href} class="flex min-h-14 items-center gap-3 py-2">
						<span class="w-20 shrink-0 text-sm text-slate-500">{timeOf(event, selected)}</span>
						<span class="flex-1">
							<span class="block">{event.title}</span>
							<span class="flex items-center gap-1.5 text-xs text-slate-500">
								{#if !event.source}<PersonDot id={event.createdById} />{/if}
								{#if event.startDate !== event.endDate}
									{shortDate(event.startDate)}–{shortDate(event.endDate)} ·
								{/if}
								{event.source ?? event.createdBy ?? 'Unbekannt'}
								{#if 'repeat' in event && event.repeat}
									<Repeat size={12} aria-label="wiederholt sich" />
								{/if}
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
	{:else}
		<p class="card px-4 py-3 text-sm text-slate-500">Keine Termine.</p>
	{/if}
</section>

<section class="mt-6" aria-label="Aufgaben">
	<div class="mb-2 flex items-center gap-2">
		{@render sectionHead(ListTodo, 'Aufgaben', selectedTasks.filter((t) => !t.done).length)}
		<a href="/kalender/aufgaben" class="text-sm text-brand-700">Alle</a>
		<a
			href="/kalender/aufgaben/neu?datum={selected}"
			class="icon-btn size-9 text-brand-700"
			aria-label="Aufgabe für diesen Tag"><Plus size={20} /></a
		>
	</div>
	{#if selectedTasks.length}
		<ul class="card px-2">
			{#each selectedTasks as task (task.id)}
				<TaskRow {task} today={data.today} />
			{/each}
		</ul>
	{:else}
		<p class="card px-4 py-3 text-sm text-slate-500">Nichts zu erledigen.</p>
	{/if}
</section>

<section id="essen" class="mt-6 scroll-mt-20" aria-label="Essen">
	<div class="mb-2 flex items-center gap-2">
		{@render sectionHead(UtensilsCrossed, 'Essen', 0)}
		<a
			href={selected === data.today ? '/kalender/essen' : `/kalender/essen?woche=${selected}`}
			class="text-sm text-brand-700">Woche planen</a
		>
	</div>
	<div class="card px-3 pt-1">
		{#key selected}
			<MealDay
				date={selected}
				meals={data.meals.filter((m) => m.date === selected)}
				datalistId="dishes"
			/>
		{/key}
	</div>
</section>

<p class="mt-8 text-center text-xs text-slate-500">
	Feiertage: {data.stateName ?? 'nur bundesweite'} ·
	<a href="/familie#feiertage" class="underline">ändern</a> ·
	<a href="/kalender/abos" class="underline">Kalender-Abos</a>
</p>
