<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// After logging out, nothing of the last account stays on the phone for offline use.
	onMount(() => {
		globalThis.caches?.delete('myfam-pages').catch(() => {});
		try {
			localStorage.removeItem('myfam-offline-queue');
		} catch {
			// Nothing stored.
		}
	});
</script>

<svelte:head><title>Anmelden · MyFam</title></svelte:head>

<form method="POST" use:enhance class="card space-y-4">
	<h2 class="text-lg font-semibold">Anmelden</h2>
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	<label class="block">
		<span class="label">E-Mail</span>
		<input name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
	</label>
	<label class="block">
		<span class="label">Passwort</span>
		<input name="password" type="password" autocomplete="current-password" required />
	</label>
	<button class="btn-primary w-full">Anmelden</button>
</form>

<details class="mt-4 text-center text-sm text-slate-600">
	<summary class="link cursor-pointer">Passwort vergessen?</summary>
	<p class="mt-2">
		Bitte einen Admin deiner Familie um einen Link zum Zurücksetzen. Den Link gibt es unter
		<strong>Familie</strong> bei deinem Namen.
	</p>
</details>

{#if data.registrationOpen}
	<p class="mt-6 text-center text-sm text-slate-600">
		Noch kein Konto?
		<a class="link" href="/registrieren{page.url.search}">Familie anlegen</a>
	</p>
{/if}
