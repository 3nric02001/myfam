<script lang="ts">
	import { enhance } from '$app/forms';
	import { ChevronLeft, ChevronRight, ShoppingCart } from '@lucide/svelte';
	import { addDays, dayLabel, shortDate, weekStart } from '$lib/dates';
	import MealDay from '$lib/components/MealDay.svelte';
	import MealDishes from '$lib/components/MealDishes.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let holidayByDate = $derived(new Map(data.holidays.map((h) => [h.date, h.name])));
	let pending = $derived(data.meals.filter((m) => m.ingredients && !m.addedToList));
	let startsToday = $derived(data.start === data.today);
	let past = $derived(data.days.filter((d) => d < data.today));
	let coming = $derived(data.days.filter((d) => d >= data.today));
</script>

<svelte:head><title>Essensplan · MyFam</title></svelte:head>

<MealDishes id="dishes" dishes={data.dishes} />

<div class="mb-3 flex items-center gap-2">
	<div class="flex-1">
		<h1 class="text-xl font-semibold tracking-tight">Essensplan</h1>
		<p class="text-sm text-slate-500">
			{startsToday
				? 'Die nächsten 7 Tage'
				: `${shortDate(data.start)} – ${shortDate(data.days[6])}`}
		</p>
	</div>
	<a
		href="?woche={addDays(data.start, -7)}"
		class="btn-secondary flex w-11 items-center justify-center px-0"
		aria-label="Vorherige Woche"
		data-sveltekit-noscroll><ChevronLeft size={20} aria-hidden="true" /></a
	>
	{#if !startsToday}
		<a href="?" class="btn-secondary px-3 text-sm" data-sveltekit-noscroll>Heute</a>
	{/if}
	<a
		href="?woche={addDays(data.start, 7)}"
		class="btn-secondary flex w-11 items-center justify-center px-0"
		aria-label="Nächste Woche"
		data-sveltekit-noscroll><ChevronRight size={20} aria-hidden="true" /></a
	>
</div>

{#if form && 'message' in form && form.message}<p class="error mb-3">{form.message}</p>{/if}
{#if form && 'listMessage' in form}<p class="success mb-3">{form.listMessage}</p>{/if}

{#if pending.length}
	<form method="POST" action="?/toList" use:enhance class="mb-4">
		{#each pending as m (m.id)}<input type="hidden" name="id" value={m.id} />{/each}
		<button class="btn-secondary w-full">
			<ShoppingCart size={18} aria-hidden="true" />
			Alle Zutaten auf die Einkaufsliste
		</button>
	</form>
{/if}

{#snippet day(date: string)}
	{@const isToday = date === data.today}
	<section class="card px-3 pt-2 {date < data.today ? 'opacity-70' : ''}">
		<h2 class="flex items-baseline gap-2 text-sm font-semibold">
			<a href="/kalender?tag={date}" class={isToday ? 'text-brand-700' : ''}
				>{dayLabel(date)}{isToday ? ' · heute' : ''}</a
			>
			{#if holidayByDate.get(date)}
				<span class="text-xs font-medium text-accent-600">{holidayByDate.get(date)}</span>
			{/if}
		</h2>
		<MealDay {date} meals={data.meals.filter((m) => m.date === date)} datalistId="dishes" />
	</section>
{/snippet}

<div class="space-y-3">
	{#if startsToday && weekStart(data.today) !== data.today}
		<a
			href="?woche={weekStart(data.today)}"
			class="block text-center text-sm text-slate-500 underline"
			data-sveltekit-noscroll>Frühere Tage dieser Woche</a
		>
	{/if}
	{#if past.length && coming.length}
		<!-- Days that are over stay out of the way, but can still be looked up. -->
		<details class="group">
			<summary class="cursor-pointer list-none text-center text-sm text-slate-500 underline">
				{past.length === 1 ? '1 vergangener Tag' : `${past.length} vergangene Tage`}
			</summary>
			<div class="mt-3 space-y-3">
				{#each past as date (date)}{@render day(date)}{/each}
			</div>
		</details>
		{#each coming as date (date)}{@render day(date)}{/each}
	{:else}
		{#each data.days as date (date)}{@render day(date)}{/each}
	{/if}
</div>
