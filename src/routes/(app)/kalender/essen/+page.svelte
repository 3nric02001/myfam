<script lang="ts">
	import { enhance } from '$app/forms';
	import { ChevronLeft, ChevronRight, ShoppingCart } from '@lucide/svelte';
	import { addDays, dayLabel, shortDate } from '$lib/dates';
	import MealDay from '$lib/components/MealDay.svelte';
	import MealDishes from '$lib/components/MealDishes.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let holidayByDate = $derived(new Map(data.holidays.map((h) => [h.date, h.name])));
	let pending = $derived(data.meals.filter((m) => m.ingredients && !m.addedToList));
	let isThisWeek = $derived(data.days.includes(data.today));
</script>

<svelte:head><title>Essensplan · MyFam</title></svelte:head>

<MealDishes id="dishes" dishes={data.dishes} />

<div class="mb-3 flex items-center gap-2">
	<a href="/kalender" class="icon-btn -ml-2" aria-label="Zum Kalender"><ChevronLeft size={22} /></a>
	<div class="flex-1">
		<h1 class="text-xl font-semibold tracking-tight">Essensplan</h1>
		<p class="text-sm text-slate-500">
			{isThisWeek ? 'Diese Woche' : `${shortDate(data.start)} – ${shortDate(data.days[6])}`}
		</p>
	</div>
	<a
		href="?woche={addDays(data.start, -7)}"
		class="btn-secondary flex w-11 items-center justify-center px-0"
		aria-label="Vorherige Woche"
		data-sveltekit-noscroll><ChevronLeft size={20} aria-hidden="true" /></a
	>
	{#if !isThisWeek}
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

<div class="space-y-3">
	{#each data.days as date (date)}
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
	{/each}
</div>
