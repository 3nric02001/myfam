<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check } from '@lucide/svelte';
	import { shortDate } from '$lib/dates';
	import type { Visibility } from '$lib/server/db/schema';
	import { visibilityLabel } from '$lib/visibility';
	import VisibilityIcon from './VisibilityIcon.svelte';

	let {
		task,
		today,
		showDue = false
	}: {
		task: {
			id: string;
			title: string;
			dueDate: string;
			assignee: string | null;
			visibility: Visibility;
			done: boolean;
		};
		today: string;
		/** Show the due day, e.g. in the list or for overdue tasks in the calendar. */
		showDue?: boolean;
	} = $props();

	let overdue = $derived(!task.done && task.dueDate < today);
	// Tick off right away, the server confirms on the next load.
	let done = $derived(task.done);
</script>

<li class="flex items-center gap-2 border-b border-slate-100 last:border-0">
	<form
		method="POST"
		action="/kalender/aufgaben?/toggle"
		use:enhance={() => {
			done = !done;
			return async ({ update }) => update({ reset: false });
		}}
	>
		<input type="hidden" name="id" value={task.id} />
		<input type="hidden" name="done" value={String(!task.done)} />
		<button
			class="flex size-11 items-center justify-center"
			aria-label="{task.title} {done ? 'wieder öffnen' : 'erledigen'}"
		>
			<span
				class="flex size-6 items-center justify-center rounded-full border-2 {done
					? 'border-brand-600 bg-brand-600 text-white'
					: 'border-slate-300'}"
				aria-hidden="true"
				>{#if done}<Check size={14} strokeWidth={3} />{/if}</span
			>
		</button>
	</form>
	<a
		href="/kalender/aufgaben/{task.id}"
		class="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-1"
	>
		<span class="min-w-0 flex-1">
			<span class="block truncate {done ? 'text-slate-400 line-through' : ''}">{task.title}</span>
			{#if showDue || overdue}
				<span class="block text-xs {overdue ? 'font-medium text-red-700' : 'text-slate-400'}">
					{overdue ? 'überfällig seit' : 'fällig'}
					{task.dueDate === today ? 'heute' : shortDate(task.dueDate)}
				</span>
			{/if}
		</span>
		{#if task.visibility !== 'family'}
			<span class="text-slate-400" title={visibilityLabel[task.visibility]}
				><VisibilityIcon visibility={task.visibility} size={16} /></span
			>
		{/if}
		{#if task.assignee}
			<span
				class="max-w-24 shrink-0 truncate rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800"
				>{task.assignee}</span
			>
		{/if}
	</a>
</li>
