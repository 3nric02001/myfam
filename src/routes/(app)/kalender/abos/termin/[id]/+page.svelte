<script lang="ts">
	import { CalendarSync, ChevronLeft, MapPin } from '@lucide/svelte';
	import { dayLabel } from '$lib/dates';
	import { colorOf } from '$lib/subscriptions';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let event = $derived(data.event);
</script>

<svelte:head><title>{event.title} · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a
		href="/kalender?tag={event.startDate}"
		class="icon-btn -ml-2 text-slate-500"
		aria-label="Zurück"><ChevronLeft size={24} aria-hidden="true" /></a
	>
	<h1 class="flex-1 text-xl font-semibold tracking-tight">{event.title}</h1>
</div>

<div class="card space-y-3 p-4">
	<p>
		{dayLabel(event.startDate)}{event.startTime ? `, ${event.startTime}` : ''}
		{#if event.endDate !== event.startDate || event.endTime}
			bis {event.endDate !== event.startDate ? dayLabel(event.endDate) : ''}{event.endTime
				? `${event.endDate !== event.startDate ? ', ' : ''}${event.endTime}`
				: ''}
		{/if}
		{#if !event.startTime}<span class="text-slate-500">(ganztägig)</span>{/if}
	</p>
	{#if event.location}
		<p class="flex items-start gap-2 text-slate-700">
			<MapPin size={18} class="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
			{event.location}
		</p>
	{/if}
	{#if event.notes}<p class="whitespace-pre-line text-slate-700">{event.notes}</p>{/if}
	<p class="flex items-center gap-1.5 text-sm text-slate-500">
		<CalendarSync size={16} class={colorOf(event.color).text} aria-hidden="true" />
		Aus dem Abo „{event.source}“ · für die ganze Familie sichtbar
	</p>
</div>

<p class="mt-3 text-center text-xs text-slate-400">
	Änderungen bitte im Ursprungskalender vornehmen.
</p>
