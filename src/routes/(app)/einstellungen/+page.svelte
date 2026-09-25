<script lang="ts">
	import { Moon, Smartphone, Sun } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { themeColor, type Theme } from '$lib/theme';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const themes = [
		{ value: 'system', label: 'Automatisch', icon: Smartphone },
		{ value: 'light', label: 'Hell', icon: Sun },
		{ value: 'dark', label: 'Dunkel', icon: Moon }
	] as const;

	// svelte-ignore state_referenced_locally
	let theme = $state<Theme>(data.theme);

	/** Switches the page right away; the form stores the choice for the next visit. */
	function applyTheme() {
		const root = document.documentElement;
		if (theme === 'system') delete root.dataset.theme;
		else root.dataset.theme = theme;
		const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
		metas.forEach((meta) => meta.remove());
		const add = (color: string, media?: string) => {
			const meta = document.createElement('meta');
			meta.name = 'theme-color';
			meta.content = color;
			if (media) meta.media = media;
			document.head.append(meta);
		};
		if (theme === 'system') {
			add(themeColor.light, '(prefers-color-scheme: light)');
			add(themeColor.dark, '(prefers-color-scheme: dark)');
		} else add(themeColor[theme]);
	}
</script>

<svelte:head><title>Einstellungen · MyFam</title></svelte:head>

{#snippet feedback(action: string)}
	{#if form?.action === action}
		{#if form.message}<p class="error">{form.message}</p>{/if}
		{#if 'success' in form && form.success}<p class="success">{form.success}</p>{/if}
	{/if}
{/snippet}

<h1 class="mb-4 text-xl font-semibold tracking-tight">Einstellungen</h1>

<form
	method="POST"
	action="?/theme"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
	class="card mb-5 space-y-4"
>
	<h2 class="font-semibold">Darstellung</h2>
	<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Darstellung">
		{#each themes as option (option.value)}
			<label
				class="flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3 text-sm {theme ===
				option.value
					? 'border-brand-600 bg-brand-50 font-medium text-brand-800'
					: 'border-slate-200 text-slate-600'}"
			>
				<input
					type="radio"
					name="theme"
					value={option.value}
					bind:group={theme}
					onchange={(e) => {
						applyTheme();
						e.currentTarget.form?.requestSubmit();
					}}
					class="sr-only"
				/>
				<option.icon size={22} strokeWidth={1.75} aria-hidden="true" />
				{option.label}
			</label>
		{/each}
	</div>
	<p class="text-xs text-slate-500">
		Gilt für dieses Gerät. „Automatisch“ folgt der Einstellung des Handys.
	</p>
</form>

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
