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
	import { REPEATS, type Repeat } from '$lib/repeat';

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
		repeat?: Repeat | null;
		repeatUntil?: string | null;
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
	// Bound, so re-rendering the form (e.g. when switching all-day) never clears what was typed.
	// svelte-ignore state_referenced_locally
	let title = $state(values.title);
	// svelte-ignore state_referenced_locally
	let notes = $state(values.notes ?? '');
	// svelte-ignore state_referenced_locally
	let allDay = $state(!values.startTime);
	// svelte-ignore state_referenced_locally
	let startDate = $state(values.startDate);
	// svelte-ignore state_referenced_locally
	let endDate = $state(values.endDate);
	// svelte-ignore state_referenced_locally
	let startTime = $state(values.startTime ?? '');
	// svelte-ignore state_referenced_locally
	let endTime = $state(values.endTime ?? '');
	// svelte-ignore state_referenced_locally
	let repeat = $state<string>(values.repeat ?? '');
	// svelte-ignore state_referenced_locally
	let repeatUntil = $state(values.repeatUntil ?? '');
	/** '' means no reminder. */
	// svelte-ignore state_referenced_locally
	let reminder = $state(values.reminder === null ? '' : String(values.reminder));

	// All-day events have other choices; switching keeps "none" and otherwise picks the default.
	function toggleAllDay() {
		// Leaving all-day: suggest the next full hour and one hour of duration.
		if (!allDay && !startTime) {
			const hour = Math.min(new Date().getHours() + 1, 23);
			startTime = `${pad(hour)}:00`;
			endTime = `${pad(Math.min(hour + 1, 23))}:${hour + 1 > 23 ? '59' : '00'}`;
		}
		if (reminder === '' || isReminder(Number(reminder), allDay)) return;
		reminder = String(allDay ? DEFAULT_ALL_DAY_REMINDER : DEFAULT_TIMED_REMINDER);
	}

	const pad = (n: number) => String(n).padStart(2, '0');
	const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
	const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

	// Moving the start keeps the duration, so the end follows along.
	function moveStart(next: string) {
		if (next && startTime && endTime && startDate === endDate) {
			const end = minutes(next) + minutes(endTime) - minutes(startTime);
			endTime = end < 24 * 60 && end >= minutes(next) ? clock(end) : endTime;
		}
		startTime = next;
	}
</script>

<form method="POST" {action} use:enhance class="card space-y-4 p-4">
	{#if error}<p class="error">{error}</p>{/if}

	<label class="block">
		<span class="label">Titel</span>
		<input name="title" required maxlength="100" bind:value={title} placeholder="z. B. Zahnarzt" />
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

	<div class="grid gap-2 {allDay ? 'grid-cols-2' : 'grid-cols-[minmax(0,1fr)_auto]'}">
		<label class="block min-w-0">
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
				<input
					type="time"
					name="startTime"
					required
					value={startTime}
					onchange={(e) => moveStart(e.currentTarget.value)}
				/>
			</label>
		{/if}
		<label class="block min-w-0">
			<span class="label">Ende</span>
			<input type="date" name="endDate" min={startDate} bind:value={endDate} />
		</label>
		{#if !allDay}
			<label class="block w-28">
				<span class="label">Uhrzeit</span>
				<input type="time" name="endTime" bind:value={endTime} />
			</label>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-2">
		<label class="block min-w-0 {repeat ? '' : 'col-span-2'}">
			<span class="label">Wiederholen</span>
			<select name="repeat" bind:value={repeat} class="w-full">
				<option value="">Nie</option>
				{#each REPEATS as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
			</select>
		</label>
		{#if repeat}
			<label class="block min-w-0">
				<span class="label">Bis (optional)</span>
				<input type="date" name="repeatUntil" min={startDate} bind:value={repeatUntil} />
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
		<textarea name="notes" rows="3" maxlength="1000" class="w-full" bind:value={notes}></textarea>
	</label>

	<button class="btn-primary w-full">{submitLabel}</button>
</form>
