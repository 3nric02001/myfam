<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import TaskForm from '../TaskForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Neue Aufgabe · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a href="/kalender?tag={data.date}" class="icon-btn -ml-2" aria-label="Zurück"
		><ChevronLeft size={22} /></a
	>
	<h1 class="text-xl font-semibold tracking-tight">Neue Aufgabe</h1>
</div>

<TaskForm
	action="?"
	submitLabel="Aufgabe speichern"
	members={data.members}
	selfId={data.user.id}
	creatorId={data.user.id}
	error={form?.message}
	values={{
		title: '',
		notes: null,
		dueDate: data.date,
		assigneeId: null,
		visibility: 'family',
		sharedWith: []
	}}
/>
