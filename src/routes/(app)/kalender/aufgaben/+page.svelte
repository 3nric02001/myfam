<script lang="ts">
	import { ChevronLeft, Plus } from '@lucide/svelte';
	import { addDays, dayLabel } from '$lib/dates';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let groups = $derived.by(() => {
		const tomorrow = addDays(data.today, 1);
		const week = addDays(data.today, 7);
		const by = (test: (d: string) => boolean) => data.open.filter((t) => test(t.dueDate));
		return [
			{ title: 'Überfällig', tasks: by((d) => d < data.today), showDue: true },
			{ title: 'Heute', tasks: by((d) => d === data.today), showDue: false },
			{ title: 'Morgen', tasks: by((d) => d === tomorrow), showDue: false },
			{ title: 'Nächste 7 Tage', tasks: by((d) => d > tomorrow && d <= week), showDue: true },
			{ title: 'Später', tasks: by((d) => d > week), showDue: true }
		].filter((g) => g.tasks.length);
	});
</script>

<svelte:head><title>Aufgaben · MyFam</title></svelte:head>

<div class="mb-3 flex items-center gap-2">
	<a href="/kalender" class="icon-btn -ml-2" aria-label="Zum Kalender"><ChevronLeft size={22} /></a>
	<h1 class="flex-1 text-xl font-semibold tracking-tight">Aufgaben</h1>
	<a href="/kalender/aufgaben/neu" class="btn-primary px-3 py-1 text-sm"
		><Plus size={18} aria-hidden="true" /> Aufgabe</a
	>
</div>

<div
	class="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium"
	role="tablist"
>
	<a
		href="?"
		role="tab"
		aria-selected={!data.mine}
		data-sveltekit-noscroll
		data-sveltekit-replacestate
		class="rounded-lg py-2 text-center {!data.mine ? 'bg-surface shadow-sm' : 'text-slate-500'}"
		>Alle</a
	>
	<a
		href="?filter=meine"
		role="tab"
		aria-selected={data.mine}
		data-sveltekit-noscroll
		data-sveltekit-replacestate
		class="rounded-lg py-2 text-center {data.mine ? 'bg-surface shadow-sm' : 'text-slate-500'}"
		>Meine</a
	>
</div>

{#if groups.length === 0}
	<p class="py-10 text-center text-slate-500">
		{data.mine ? 'Für dich ist gerade nichts zu tun.' : 'Keine offenen Aufgaben.'}
	</p>
{/if}

{#each groups as group (group.title)}
	<h2
		class="mt-4 mb-1 text-sm font-semibold {group.title === 'Überfällig'
			? 'text-red-700'
			: 'text-slate-500'}"
	>
		{group.title}
		{#if group.title === 'Heute'}<span class="font-normal">· {dayLabel(data.today)}</span>{/if}
	</h2>
	<ul class="card px-2">
		{#each group.tasks as task (task.id)}
			<TaskRow {task} today={data.today} showDue={group.showDue} />
		{/each}
	</ul>
{/each}

{#if data.done.length}
	<h2 class="mt-6 mb-1 text-sm font-semibold text-slate-500">Zuletzt erledigt</h2>
	<ul class="card px-2">
		{#each data.done as task (task.id)}
			<TaskRow {task} today={data.today} />
		{/each}
	</ul>
{/if}
