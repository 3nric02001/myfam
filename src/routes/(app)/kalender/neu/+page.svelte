<script lang="ts">
	import EventForm from '../EventForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Neuer Termin · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a href="/kalender?tag={data.date}" class="p-1 text-slate-500" aria-label="Zurück">‹</a>
	<h1 class="text-xl font-bold">Neuer Termin</h1>
</div>

<EventForm
	action="?"
	submitLabel="Termin speichern"
	members={data.members}
	error={form?.message}
	values={{
		title: '',
		notes: null,
		startDate: data.date,
		startTime: null,
		endDate: data.date,
		endTime: null,
		visibility: 'family',
		sharedWith: []
	}}
/>
