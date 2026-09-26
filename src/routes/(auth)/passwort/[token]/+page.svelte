<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Neues Passwort · MyFam</title></svelte:head>

<form method="POST" use:enhance class="card space-y-4">
	<h2 class="text-lg font-semibold">Neues Passwort für {data.name}</h2>
	<p class="text-sm text-slate-500">
		Danach bist du auf allen anderen Geräten abgemeldet und meldest dich dort mit dem neuen Passwort
		wieder an.
	</p>
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	<input type="hidden" name="email" autocomplete="username" value={data.email} />
	<label class="block">
		<span class="label">Neues Passwort (mind. 10 Zeichen)</span>
		<input name="password" type="password" autocomplete="new-password" required minlength="10" />
	</label>
	<label class="block">
		<span class="label">Neues Passwort wiederholen</span>
		<input
			name="confirmPassword"
			type="password"
			autocomplete="new-password"
			required
			minlength="10"
		/>
	</label>
	<button class="btn-primary w-full">Passwort speichern</button>
</form>
