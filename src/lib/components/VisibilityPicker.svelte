<script lang="ts">
	// Form fields for who can see an entry: `visibility` plus one `sharedWith` field per selected
	// member. Used by calendar events and planning folders.
	import type { Visibility } from '$lib/server/db/schema';
	import { visibilityIcon, visibilityLabel } from '$lib/visibility';

	let {
		visibility: initial = 'family',
		sharedWith = [],
		members,
		noun,
		lockVisibility = false
	}: {
		visibility?: Visibility;
		sharedWith?: string[];
		/** Family members the entry can be shared with (without the creator). */
		members: { id: string; name: string }[];
		/** What is being shared, e.g. „den Termin“ or „den Ordner“. */
		noun: string;
		/** Only the creator may change who sees an entry. */
		lockVisibility?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	let visibility = $state<Visibility>(initial);

	const options: Visibility[] = ['family', 'shared', 'private'];
	let hints = $derived<Record<Visibility, string>>({
		family: `Alle in der Familie sehen ${noun}.`,
		shared: 'Nur du und die ausgewählten Personen.',
		private: `Nur du siehst ${noun}.`
	});
</script>

<fieldset>
	<legend class="label">Wer sieht {noun}?</legend>
	{#if lockVisibility}
		<input type="hidden" name="visibility" value={visibility} />
		<p class="text-sm text-slate-600">
			{visibilityIcon[visibility]}
			{visibilityLabel[visibility]} – nur die Person, die {noun} angelegt hat, kann das ändern.
		</p>
	{:else}
		<div class="grid grid-cols-3 gap-2">
			{#each options as option (option)}
				<label
					class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs {visibility ===
					option
						? 'border-emerald-600 bg-emerald-50 text-emerald-800'
						: 'border-slate-300 text-slate-600'}"
				>
					<input
						type="radio"
						name="visibility"
						value={option}
						bind:group={visibility}
						class="sr-only"
					/>
					<span class="text-xl" aria-hidden="true">{visibilityIcon[option]}</span>
					{visibilityLabel[option]}
				</label>
			{/each}
		</div>
		<p class="mt-1 text-xs text-slate-500">{hints[visibility]}</p>
	{/if}

	{#if visibility === 'shared'}
		<div class="mt-2 space-y-1 rounded-lg bg-slate-50 p-3">
			{#each members as member (member.id)}
				<label class="flex min-h-10 items-center gap-2">
					<input
						type="checkbox"
						name="sharedWith"
						value={member.id}
						checked={sharedWith.includes(member.id)}
						disabled={lockVisibility}
						class="size-5 rounded"
					/>
					{member.name}
				</label>
				{#if lockVisibility && sharedWith.includes(member.id)}
					<input type="hidden" name="sharedWith" value={member.id} />
				{/if}
			{:else}
				<p class="text-sm text-slate-500">
					Außer dir ist noch niemand in der Familie. Lade jemanden über „Familie“ ein.
				</p>
			{/each}
		</div>
	{/if}
</fieldset>
