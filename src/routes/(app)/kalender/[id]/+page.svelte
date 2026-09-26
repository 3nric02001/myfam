<script lang="ts">
	import { Bell, ChevronLeft, Repeat } from '@lucide/svelte';
	import { reminderLabel } from '$lib/reminders';
	import { repeatLabel } from '$lib/repeat';
	import { enhance } from '$app/forms';
	import { dayLabel } from '$lib/dates';
	import EventForm from '../EventForm.svelte';
	import { visibilityLabel } from '$lib/visibility';
	import VisibilityIcon from '$lib/components/VisibilityIcon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let event = $derived(data.event);

	let sharedNames = $derived(
		data.members.filter((m) => event.sharedWith.includes(m.id)).map((m) => m.name)
	);
</script>

<svelte:head><title>{event.title} · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a
		href="/kalender?tag={event.startDate}"
		class="icon-btn -ml-2 text-slate-500"
		aria-label="Zurück"><ChevronLeft size={24} aria-hidden="true" /></a
	>
	<h1 class="flex-1 text-xl font-semibold tracking-tight">
		{data.editable ? 'Termin bearbeiten' : event.title}
	</h1>
</div>

{#if data.editable}
	<EventForm
		action="?/update"
		submitLabel="Änderungen speichern"
		members={data.members}
		lockVisibility={!data.isCreator}
		error={form?.message}
		values={event}
	/>
	<form
		method="POST"
		action="?/delete"
		class="mt-4"
		use:enhance={({ cancel }) => {
			if (!confirm(`„${event.title}“ wirklich löschen?`)) cancel();
		}}
	>
		<button class="btn-secondary w-full text-red-700">Termin löschen</button>
	</form>
{:else}
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
		{#if event.repeat}
			<p class="text-sm text-slate-500">
				<Repeat size={16} class="inline align-[-3px]" aria-hidden="true" />
				{repeatLabel(event.repeat)}{event.repeatUntil ? ` bis ${dayLabel(event.repeatUntil)}` : ''}
			</p>
		{/if}
		{#if event.notes}<p class="whitespace-pre-line text-slate-700">{event.notes}</p>{/if}
		<p class="text-sm text-slate-500">
			<VisibilityIcon visibility={event.visibility} size={16} class="inline align-[-3px]" />
			{visibilityLabel[event.visibility]}{event.visibility === 'shared' && sharedNames.length
				? `: ${sharedNames.join(', ')}`
				: ''}
		</p>
		{#if event.reminder !== null}
			<p class="text-sm text-slate-500">
				<Bell size={16} class="inline align-[-3px]" aria-hidden="true" />
				Erinnerung: {reminderLabel(event.reminder, !event.startTime)}
			</p>
		{/if}
		<p class="text-sm text-slate-500">Angelegt von {data.creator ?? 'einem früheren Mitglied'}</p>
	</div>
{/if}
