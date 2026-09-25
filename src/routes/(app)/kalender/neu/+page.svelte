<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import EventForm from '../EventForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Neuer Termin · MyFam</title></svelte:head>

<div class="mb-4 flex items-center gap-2">
	<a href="/kalender?tag={data.date}" class="icon-btn -ml-2 text-slate-500" aria-label="Zurück"
		><ChevronLeft size={24} aria-hidden="true" /></a
	>
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
