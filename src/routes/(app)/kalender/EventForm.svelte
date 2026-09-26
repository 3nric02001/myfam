<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Visibility } from '$lib/server/db/schema';
	import VisibilityPicker from '$lib/components/VisibilityPicker.svelte';
	import {
		DEFAULT_ALL_DAY_REMINDER,
		DEFAULT_TIMED_REMINDER,
		isReminder,
		reminderOptions
	} from '$lib/reminders';

	type Values = {
		title: string;
		notes: string | null;
		startDate: string;
		startTime: string | null;
		endDate: string;
		endTime: string | null;
		visibility: Visibility;
		sharedWith: string[];
		reminder: number | null;
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
	let startDate = $state(values.startDate);
	// svelte-ignore state_referenced_locally
	let endDate = $state(values.endDate);
	/** '' means no reminder. */
	// svelte-ignore state_referenced_locally
	let reminder = $state(values.reminder === null ? '' : String(values.reminder));

	// All-day events have other choices; switching keeps "none" and otherwise picks the default.
	function toggleAllDay() {
		if (reminder === '' || isReminder(Number(reminder), allDay)) return;
		reminder = String(allDay ? DEFAULT_ALL_DAY_REMINDER : DEFAULT_TIMED_REMINDER);
	}
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
		<input
			type="checkbox"
			name="allDay"
			bind:checked={allDay}
			onchange={toggleAllDay}
			class="size-5 rounded"
		/>
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

	<label class="block">
		<span class="label">Erinnerung aufs Handy</span>
		<select name="reminder" bind:value={reminder} class="w-full">
			<option value="">Keine</option>
			{#each reminderOptions(allDay) as option (option.value)}
				<option value={String(option.value)}>{option.label}</option>
			{/each}
		</select>
	</label>

	<VisibilityPicker
		visibility={values.visibility}
		sharedWith={values.sharedWith}
		{members}
		{lockVisibility}
		noun="den Termin"
	/>

	<label class="block">
		<span class="label">Notiz (optional)</span>
		<textarea name="notes" rows="3" maxlength="1000" class="w-full">{values.notes ?? ''}</textarea>
	</label>

	<button class="btn-primary w-full">{submitLabel}</button>
</form>
