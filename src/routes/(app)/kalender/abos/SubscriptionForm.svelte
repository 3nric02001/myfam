<script lang="ts">
	import { enhance } from '$app/forms';
	import { subscriptionColors } from '$lib/subscriptions';

	type Values = {
		name: string;
		url: string;
		username: string | null;
		color: string;
		hasPassword: boolean;
	};

	let {
		values,
		action,
		submitLabel,
		error
	}: { values: Values; action: string; submitLabel: string; error?: string } = $props();

	let saving = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="card space-y-4 p-4"
>
	{#if error}<p class="error">{error}</p>{/if}

	<label class="block">
		<span class="label">Name</span>
		<input
			name="name"
			required
			maxlength="50"
			value={values.name}
			placeholder="z. B. Nextcloud Enrico"
		/>
		<span class="mt-1 block text-xs text-slate-500">Steht bei jedem Termin als Quelle.</span>
	</label>

	<label class="block">
		<span class="label">Adresse</span>
		<input
			name="url"
			type="url"
			required
			inputmode="url"
			autocomplete="off"
			value={values.url}
			placeholder="https://cloud.example.de/remote.php/dav/calendars/…"
		/>
		<span class="mt-1 block text-xs text-slate-500">
			Nextcloud: im Kalender beim Kalendernamen „…“ → „Interne Adresse kopieren“. Öffentliche
			ICS-Links (auch webcal://) gehen ebenfalls.
		</span>
	</label>

	<label class="block">
		<span class="label"
			>Benutzername <span class="font-normal text-slate-500">(optional)</span></span
		>
		<input name="username" autocomplete="off" value={values.username ?? ''} />
	</label>

	<label class="block">
		<span class="label"
			>App-Passwort <span class="font-normal text-slate-500">(optional)</span></span
		>
		<input
			name="password"
			type="password"
			autocomplete="new-password"
			placeholder={values.hasPassword ? 'Gespeichert – leer lassen, um es zu behalten' : ''}
		/>
		<span class="mt-1 block text-xs text-slate-500">
			Nextcloud: Einstellungen → Sicherheit → „Neues App-Passwort erstellen“. Wird verschlüsselt
			gespeichert und nur zum Lesen verwendet.
		</span>
	</label>

	<fieldset>
		<legend class="label">Farbe</legend>
		<div class="flex flex-wrap gap-3">
			{#each Object.entries(subscriptionColors) as [key, color] (key)}
				<label class="flex items-center gap-1.5 text-sm">
					<input
						type="radio"
						name="color"
						value={key}
						checked={values.color === key}
						class="size-5"
					/>
					<span class="size-4 rounded-full {color.dot}" aria-hidden="true"></span>
					{color.label}
				</label>
			{/each}
		</div>
	</fieldset>

	<button class="btn-primary w-full" disabled={saving}>
		{saving ? 'Kalender wird abgerufen …' : submitLabel}
	</button>
</form>
