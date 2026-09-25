<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Visibility } from '$lib/server/db/schema';
	import { visibilityIcon, visibilityLabel } from './visibility';

	type Values = {
		title: string;
		notes: string | null;
		startDate: string;
		startTime: string | null;
		endDate: string;
		endTime: string | null;
		visibility: Visibility;
		sharedWith: string[];
	};

	let {
		values,
		members,
		action,
		submitLabel,
		lockVisibility = false,
		error
	}: {
		values: Values;
		/** Family members the event can be shared with (without the creator). */
		members: { id: string; name: string }[];
		action: string;
		submitLabel: string;
		/** Admins editing someone else's event may not change who sees it. */
		lockVisibility?: boolean;
		error?: string;
	} = $props();

	// The form starts from the given values and is then edited locally.
	// svelte-ignore state_referenced_locally
	let allDay = $state(!values.startTime);
	// svelte-ignore state_referenced_locally
	let visibility = $state<Visibility>(values.visibility);
	// svelte-ignore state_referenced_locally
	let startDate = $state(values.startDate);
	// svelte-ignore state_referenced_locally
	let endDate = $state(values.endDate);

	const options: Visibility[] = ['family', 'shared', 'private'];
	const hints: Record<Visibility, string> = {
		family: 'Alle in der Familie sehen den Termin.',
		shared: 'Nur du und die ausgewählten Personen.',
		private: 'Nur du siehst den Termin.'
	};
</script>

<form method="POST" {action} use:enhance class="card space-y-4 p-4">
	{#if error}<p class="error">{error}</p>{/if}

	<label class="block">
		<span class="label">Titel</span>
		<input
			name="title"
			required
			maxlength="100"
			value={values.title}
			placeholder="z. B. Zahnarzt"
		/>
	</label>

	<label class="flex items-center gap-2">
		<input type="checkbox" name="allDay" bind:checked={allDay} class="size-5 rounded" />
		<span>Ganztägig</span>
	</label>

	<div class="grid grid-cols-[1fr_auto] gap-2">
		<label class="block">
			<span class="label">Beginn</span>
			<input
				type="date"
				name="startDate"
				required
				bind:value={startDate}
				onchange={() => {
					if (!endDate || endDate < startDate) endDate = startDate;
				}}
			/>
		</label>
		{#if !allDay}
			<label class="block w-28">
				<span class="label">Uhrzeit</span>
				<input type="time" name="startTime" required value={values.startTime ?? ''} />
			</label>
		{/if}
		<label class="block">
			<span class="label">Ende</span>
			<input type="date" name="endDate" min={startDate} bind:value={endDate} />
		</label>
		{#if !allDay}
			<label class="block w-28">
				<span class="label">Uhrzeit</span>
				<input type="time" name="endTime" value={values.endTime ?? ''} />
			</label>
		{/if}
	</div>

	<fieldset>
		<legend class="label">Wer sieht den Termin?</legend>
		{#if lockVisibility}
			<input type="hidden" name="visibility" value={visibility} />
			<p class="text-sm text-slate-600">
				{visibilityIcon[visibility]}
				{visibilityLabel[visibility]} – nur die Person, die den Termin angelegt hat, kann das ändern.
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
							checked={values.sharedWith.includes(member.id)}
							disabled={lockVisibility}
							class="size-5 rounded"
						/>
						{member.name}
					</label>
					{#if lockVisibility && values.sharedWith.includes(member.id)}
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

	<label class="block">
		<span class="label">Notiz (optional)</span>
		<textarea name="notes" rows="3" maxlength="1000" class="w-full">{values.notes ?? ''}</textarea>
	</label>

	<button class="btn-primary w-full">{submitLabel}</button>
</form>
