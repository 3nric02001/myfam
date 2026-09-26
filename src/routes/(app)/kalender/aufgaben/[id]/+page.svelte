<script lang="ts">
	import { enhance } from '$app/forms';
	import { ChevronLeft } from '@lucide/svelte';
	import { dayLabel } from '$lib/dates';
	import { visibilityLabel } from '$lib/visibility';
	import VisibilityIcon from '$lib/components/VisibilityIcon.svelte';
	import TaskForm from '../TaskForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let task = $derived(data.task);
	let done = $derived(task.doneAt !== null);
</script>

<svelte:head><title>{task.title} · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a href="/kalender?tag={task.dueDate}" class="icon-btn -ml-2" aria-label="Zurück"
		><ChevronLeft size={22} /></a
	>
	<h1 class="flex-1 text-xl font-semibold tracking-tight">
		{data.editable ? 'Aufgabe bearbeiten' : task.title}
	</h1>
</div>

<form method="POST" action="?/toggle" use:enhance class="mb-4">
	<input type="hidden" name="done" value={String(!done)} />
	{#if done}
		<p class="success mb-2">
			Erledigt{data.doneBy ? ` von ${data.doneBy}` : ''}.
		</p>
		<button class="btn-secondary w-full">Wieder öffnen</button>
	{:else}
		<button class="btn-primary w-full">Als erledigt abhaken</button>
	{/if}
</form>

{#if data.editable}
	<TaskForm
		action="?/update"
		submitLabel="Änderungen speichern"
		members={data.members}
		selfId={data.user.id}
		creatorId={task.createdBy ?? data.user.id}
		lockVisibility={!data.isCreator}
		error={form?.message}
		values={task}
	/>
	<form
		method="POST"
		action="?/delete"
		class="mt-4"
		use:enhance={({ cancel }) => {
			if (!confirm(`„${task.title}“ wirklich löschen?`)) cancel();
		}}
	>
		<button class="btn-secondary w-full text-red-700">Aufgabe löschen</button>
	</form>
{:else}
	<div class="card space-y-3 p-4">
		<p>Fällig {task.dueDate === data.today ? 'heute' : `am ${dayLabel(task.dueDate)}`}</p>
		<p class="text-sm text-slate-600">{data.assignee ? `Für ${data.assignee}` : 'Egal wer'}</p>
		{#if task.notes}<p class="whitespace-pre-line text-slate-700">{task.notes}</p>{/if}
		<p class="flex items-center gap-1.5 text-sm text-slate-500">
			<VisibilityIcon visibility={task.visibility} size={16} />
			{visibilityLabel[task.visibility]}
		</p>
		<p class="text-sm text-slate-500">Angelegt von {data.creator ?? 'einem früheren Mitglied'}</p>
	</div>
{/if}
