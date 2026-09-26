<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Familie anlegen · MyFam</title></svelte:head>

{#if !data.open}
	<div class="card space-y-3">
		<h2 class="text-lg font-semibold">Nur mit Einladung</h2>
		<p class="text-sm text-slate-500">
			Neue Konten gibt es nur über einen Einladungslink. Bitte jemanden aus deiner Familie, dir
			unter <strong>Familie → Einladungslink erstellen</strong> einen Link zu schicken.
		</p>
	</div>
{:else}
	<form method="POST" use:enhance class="card space-y-4">
		<h2 class="text-lg font-semibold">Neue Familie anlegen</h2>
		<p class="text-sm text-slate-500">
			Du wirst Admin der Familie und kannst danach die anderen per Link einladen.
		</p>
		{#if form?.message}<p class="error">{form.message}</p>{/if}
		<label class="block">
			<span class="label">Familienname</span>
			<input
				name="familyName"
				required
				maxlength="60"
				placeholder="z. B. Familie Müller"
				value={form?.familyName ?? ''}
			/>
		</label>
		<label class="block">
			<span class="label">Dein Name</span>
			<input
				name="name"
				autocomplete="given-name"
				required
				maxlength="60"
				value={form?.name ?? ''}
			/>
		</label>
		<label class="block">
			<span class="label">E-Mail</span>
			<input name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
		</label>
		<label class="block">
			<span class="label">Passwort (mind. 10 Zeichen)</span>
			<input name="password" type="password" autocomplete="new-password" required minlength="10" />
		</label>
		<button class="btn-primary w-full">Familie anlegen</button>
	</form>
{/if}

<p class="mt-6 text-center text-sm text-slate-600">
	Schon ein Konto? <a class="link" href="/login">Anmelden</a>
</p>
