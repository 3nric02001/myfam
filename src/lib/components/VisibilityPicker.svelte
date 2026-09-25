<script lang="ts">
	// Form fields for who can see an entry: `visibility` plus one `share` field per selected member.
	// Read on the server with parseVisibility() from $lib/server/visibility.
	type Visibility = 'family' | 'shared' | 'private';

	let {
		members,
		selfId,
		visibility = 'family',
		sharedWith = []
	}: {
		members: { id: string; name: string }[];
		selfId: string;
		visibility?: Visibility;
		sharedWith?: string[];
	} = $props();

	// svelte-ignore state_referenced_locally
	let choice = $state<Visibility>(visibility);
	let others = $derived(members.filter((m) => m.id !== selfId));

	const options: { value: Visibility; label: string; hint: string }[] = [
		{ value: 'family', label: 'Ganze Familie', hint: 'Alle Mitglieder sehen es' },
		{ value: 'shared', label: 'Bestimmte Personen', hint: 'Nur du und die Ausgewählten' },
		{ value: 'private', label: 'Nur ich', hint: 'Privat, niemand sonst sieht es' }
	];
</script>

<fieldset>
	<legend class="label">Wer sieht das?</legend>
	<div class="space-y-1">
		{#each options as option (option.value)}
			<label class="flex items-center gap-3 rounded-lg px-1 py-1.5">
				<input type="radio" name="visibility" value={option.value} bind:group={choice} />
				<span>
					<span class="block text-sm">{option.label}</span>
					<span class="block text-xs text-slate-500">{option.hint}</span>
				</span>
			</label>
		{/each}
	</div>
	{#if choice === 'shared'}
		<div class="mt-2 ml-8 space-y-1 border-l-2 border-emerald-100 pl-3">
			{#each others as member (member.id)}
				<label class="flex items-center gap-2 py-1 text-sm">
					<input
						type="checkbox"
						name="share"
						value={member.id}
						checked={sharedWith.includes(member.id)}
					/>
					{member.name}
				</label>
			{:else}
				<p class="text-xs text-slate-500">
					Es gibt noch keine anderen Mitglieder. Lade sie unter „Familie“ ein.
				</p>
			{/each}
		</div>
	{/if}
</fieldset>
