<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, Plus, ShoppingCart, Trash2 } from '@lucide/svelte';
	import { mealSlotLabel, mealSlots, type PlannedMeal } from '$lib/meals';
	import type { MealSlot } from '$lib/server/db/schema';

	let {
		date,
		meals,
		datalistId
	}: {
		date: string;
		/** The meals planned on this day. */
		meals: PlannedMeal[];
		/** Id of a <datalist> with earlier dishes, rendered once by the page. */
		datalistId: string;
	} = $props();

	const action = '/kalender/essen';

	let bySlot = $derived(new Map(meals.map((m) => [m.slot, m])));
	let free = $derived(mealSlots.filter((s) => !bySlot.has(s)));

	/** The slot being edited, if any. */
	let editing = $state<MealSlot | null>(null);
	let name = $state('');
	let ingredients = $state('');
	let busy = $state(false);

	function edit(slot: MealSlot) {
		const current = bySlot.get(slot);
		editing = slot;
		name = current?.name ?? '';
		ingredients = current?.ingredients ?? '';
	}

	// Picking an earlier dish fills in what it needed last time.
	function pickDish() {
		if (ingredients.trim()) return;
		const list = document.getElementById(datalistId) as HTMLDataListElement | null;
		const option = [...(list?.options ?? [])].find(
			(o) => o.value.toLowerCase() === name.trim().toLowerCase()
		);
		if (option?.dataset.ingredients) ingredients = option.dataset.ingredients;
	}

	const submit = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
			editing = null;
		};
	};
</script>

{#snippet editor(slot: MealSlot, current: PlannedMeal | undefined)}
	<form method="POST" action="{action}?/save" use:enhance={submit} class="space-y-2 py-2">
		<input type="hidden" name="date" value={date} />
		<input type="hidden" name="slot" value={slot} />
		<label class="block">
			<span class="label">{mealSlotLabel[slot]}</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="name"
				required
				maxlength="100"
				autocomplete="off"
				list={datalistId}
				placeholder="Was gibt es?"
				bind:value={name}
				onchange={pickDish}
				autofocus
			/>
		</label>
		<label class="block">
			<span class="label">Zutaten <span class="font-normal text-slate-500">(optional)</span></span>
			<textarea
				name="ingredients"
				rows="3"
				maxlength="2000"
				class="w-full text-sm"
				placeholder="500 g Nudeln&#10;1 Dose Tomaten"
				bind:value={ingredients}></textarea>
		</label>
		<div class="flex gap-2">
			<button class="btn-primary flex-1" disabled={busy}>Speichern</button>
			<button type="button" class="btn-secondary" onclick={() => (editing = null)}>Abbrechen</button
			>
			{#if current}
				<button
					class="icon-btn"
					formaction="{action}?/delete"
					formnovalidate
					aria-label="{current.name} entfernen"><Trash2 size={18} /></button
				>
				<input type="hidden" name="id" value={current.id} />
			{/if}
		</div>
	</form>
{/snippet}

<ul>
	{#each mealSlots as slot (slot)}
		{@const current = bySlot.get(slot)}
		{#if editing === slot}
			<li class="border-b border-slate-100 last:border-0">{@render editor(slot, current)}</li>
		{:else if current}
			<li class="flex items-center gap-2 border-b border-slate-100 last:border-0">
				<button
					type="button"
					class="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
					onclick={() => edit(slot)}
				>
					<span class="w-16 shrink-0 text-xs font-medium text-slate-500">{mealSlotLabel[slot]}</span
					>
					<span class="min-w-0 flex-1">
						{current.name}
						{#if current.ingredients}
							<span class="block truncate text-xs text-slate-500"
								>{current.ingredients.split('\n').join(', ')}</span
							>
						{/if}
					</span>
				</button>
				{#if current.ingredients}
					{#if current.addedToList}
						<span
							class="icon-btn text-brand-600"
							title="Zutaten stehen auf der Einkaufsliste"
							aria-label="Zutaten stehen auf der Einkaufsliste"><Check size={18} /></span
						>
					{:else}
						<form method="POST" action="{action}?/toList" use:enhance>
							<input type="hidden" name="id" value={current.id} />
							<button
								class="icon-btn text-brand-700"
								title="Zutaten auf die Einkaufsliste"
								aria-label="Zutaten für {current.name} auf die Einkaufsliste"
								><ShoppingCart size={18} /></button
							>
						</form>
					{/if}
				{/if}
			</li>
		{/if}
	{/each}
</ul>

{#if free.length && !(editing && free.includes(editing))}
	<div class="flex flex-wrap gap-2 py-2">
		{#each free as slot (slot)}
			<button
				type="button"
				class="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 text-sm text-slate-600 active:bg-slate-100"
				onclick={() => edit(slot)}
				><Plus size={14} aria-hidden="true" />{mealSlotLabel[slot]}</button
			>
		{/each}
	</div>
{/if}
