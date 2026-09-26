<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		CalendarDays,
		CalendarSync,
		CheckCheck,
		ListTodo,
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
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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

<h1 class="text-xl font-semibold tracking-tight">{dayLabel(data.today)}</h1>
<p class="mb-4 text-sm text-slate-500">Das Wichtigste für dich auf einen Blick.</p>

<section class="card mb-4 px-3 pt-2 pb-1" aria-labelledby="termine">
	<div class="flex items-center justify-between">
		<h2 id="termine" class="flex items-center gap-1.5 font-semibold">
			<CalendarDays size={18} class="text-brand-700" aria-hidden="true" /> Termine
		</h2>
		<a href="/kalender" class="text-sm text-brand-700">Kalender</a>
	</div>
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
				{#each day.events as event (event.id)}
					<li class="border-b border-slate-100 last:border-0">
						<a href={event.href} class="flex min-h-12 items-center gap-3 py-1.5">
							<span class="w-24 shrink-0 text-sm whitespace-nowrap text-slate-500"
								>{timeOf(event, day.date)}</span
							>
							<span class="min-w-0 flex-1">
								<span class="block truncate">{event.title}</span>
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
</section>

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
