<script lang="ts">
	import { enhance } from '$app/forms';
	import VisibilityPicker from '$lib/components/VisibilityPicker.svelte';
	import type { Visibility } from '$lib/server/db/schema';

	let {
		values,
		members,
		selfId,
		creatorId,
		action,
		submitLabel,
		lockVisibility = false,
		error
	}: {
		values: {
			title: string;
			notes: string | null;
			dueDate: string;
			assigneeId: string | null;
			visibility: Visibility;
			sharedWith: string[];
		};
		/** All members of the family. */
		members: { id: string; name: string }[];
		selfId: string;
		creatorId: string;
		action: string;
		submitLabel: string;
		lockVisibility?: boolean;
		error?: string;
	} = $props();
</script>

<form method="POST" {action} use:enhance class="card space-y-4 p-4">
	{#if error}<p class="error">{error}</p>{/if}

	<label class="block">
		<span class="label">Was ist zu tun?</span>
		<input
			name="title"
			required
			maxlength="100"
			value={values.title}
			placeholder="z. B. Müll rausbringen"
		/>
	</label>

	<div class="grid grid-cols-2 gap-2">
		<label class="block">
			<span class="label">Fällig am</span>
			<input type="date" name="dueDate" required value={values.dueDate} />
		</label>
		<label class="block">
			<span class="label">Wer?</span>
			<select name="assigneeId" class="w-full" value={values.assigneeId ?? ''}>
				<option value="">Egal wer</option>
				{#each members as member (member.id)}
					<option value={member.id}
						>{member.id === selfId ? `Ich (${member.name})` : member.name}</option
					>
				{/each}
			</select>
		</label>
	</div>

	<VisibilityPicker
		noun="die Aufgabe"
		visibility={values.visibility}
		sharedWith={values.sharedWith}
		members={members.filter((m) => m.id !== creatorId)}
		{lockVisibility}
	/>

	<label class="block">
		<span class="label">Notiz <span class="font-normal text-slate-400">(optional)</span></span>
		<textarea name="notes" rows="3" maxlength="1000" class="w-full">{values.notes ?? ''}</textarea>
	</label>

	<button class="btn-primary w-full">{submitLabel}</button>
</form>
