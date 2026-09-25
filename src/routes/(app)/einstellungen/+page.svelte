<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Einstellungen · MyFam</title></svelte:head>

{#snippet feedback(action: string)}
	{#if form?.action === action}
		{#if form.message}<p class="error">{form.message}</p>{/if}
		{#if 'success' in form && form.success}<p class="success">{form.success}</p>{/if}
	{/if}
{/snippet}

<h1 class="mb-4 text-xl font-bold">Einstellungen</h1>

<form
	method="POST"
	action="?/name"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
	class="card mb-5 space-y-4"
>
	<h2 class="font-semibold">Name</h2>
	{@render feedback('name')}
	<label class="block">
		<span class="label">Dein Name</span>
		<input
			name="name"
			autocomplete="name"
			required
			maxlength="60"
			value={form?.action === 'name' && 'name' in form ? form.name : data.user.name}
		/>
	</label>
	<button class="btn-primary w-full">Name speichern</button>
</form>

<form
	method="POST"
	action="?/email"
	use:enhance={({ formElement }) =>
		async ({ update }) => {
			// Keep the email in the field, but never leave the password behind.
			await update({ reset: false });
			formElement.querySelector<HTMLInputElement>('[name=currentPassword]')!.value = '';
		}}
	class="card mb-5 space-y-4"
>
	<h2 class="font-semibold">E-Mail-Adresse</h2>
	{@render feedback('email')}
	<label class="block">
		<span class="label">Neue E-Mail-Adresse</span>
		<input
			name="email"
			type="email"
			autocomplete="email"
			required
			value={form?.action === 'email' && 'email' in form ? form.email : data.user.email}
		/>
	</label>
	<label class="block">
		<span class="label">Aktuelles Passwort zur Bestätigung</span>
		<input name="currentPassword" type="password" autocomplete="current-password" required />
	</label>
	<button class="btn-primary w-full">E-Mail ändern</button>
</form>

<form method="POST" action="?/password" use:enhance class="card mb-5 space-y-4">
	<h2 class="font-semibold">Passwort</h2>
	{@render feedback('password')}
	<label class="block">
		<span class="label">Aktuelles Passwort</span>
		<input name="currentPassword" type="password" autocomplete="current-password" required />
	</label>
	<label class="block">
		<span class="label">Neues Passwort (mind. 10 Zeichen)</span>
		<input name="newPassword" type="password" autocomplete="new-password" required minlength="10" />
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
	<button class="btn-primary w-full">Passwort ändern</button>
</form>

<form method="POST" action="/logout">
	<button class="btn-secondary w-full">Abmelden</button>
</form>
