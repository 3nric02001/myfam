<script lang="ts">
	import {
		ChevronDown,
		KeyRound,
		LogOut,
		Mail,
		Moon,
		Smartphone,
		Sun,
		Trash2,
		UserRound
	} from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { themeColor, type Theme } from '$lib/theme';
	import PushSettings from './PushSettings.svelte';
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

	type Section = 'name' | 'email' | 'password' | 'delete';
	// A section with an error stays open so the message and the entered values are visible.
	let open = $state<Section | null>(null);
	$effect(() => {
		if (form?.action && form.action !== 'theme' && form.action !== 'push')
			open = form.message ? (form.action as Section) : null;
	});

	let initials = $derived(
		data.user.name
			.split(/\s+/)
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
</script>

<svelte:head><title>Einstellungen · MyFam</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold tracking-tight">Einstellungen</h1>

<section class="card mb-6 flex items-center gap-4 p-4">
	<span
		class="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700"
		aria-hidden="true">{initials}</span
	>
	<div class="min-w-0 flex-1">
		<p class="truncate text-lg font-semibold">{data.user.name}</p>
		<p class="truncate text-sm text-slate-500">{data.user.email}</p>
		{#if data.family}
			<p class="mt-1 text-xs text-slate-500">
				{data.family.name} · {data.family.role === 'admin' ? 'Admin' : 'Mitglied'}
			</p>
		{/if}
	</div>
</section>

{#if form?.action && form.action !== 'theme' && form.action !== 'push' && 'success' in form && form.success}
	<p class="success mb-4" role="status">{form.success}</p>
{/if}

<h2 class="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Darstellung</h2>
<form
	method="POST"
	action="?/theme"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
	class="card mb-6 p-2"
>
	<div class="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Darstellung">
		{#each themes as option (option.value)}
			<label
				class="flex cursor-pointer flex-col items-center gap-1 rounded-xl p-2.5 text-sm {theme ===
				option.value
					? 'bg-brand-50 font-medium text-brand-800 ring-1 ring-brand-600'
					: 'text-slate-600'}"
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
	<p class="px-2 pt-2 pb-1 text-xs text-slate-500">
		Gilt für dieses Gerät. „Automatisch“ folgt der Einstellung des Handys.
	</p>
</form>

<h2 class="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
	Benachrichtigungen
</h2>
<PushSettings
	publicKey={data.push.publicKey}
	devices={data.push.devices}
	message={form?.action === 'push' && 'message' in form ? form.message : undefined}
	success={form?.action === 'push' && 'success' in form ? form.success : undefined}
/>

<h2 class="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Konto</h2>

{#snippet row(section: Section, label: string, value: string, Icon: typeof UserRound)}
	<button
		type="button"
		class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
		aria-expanded={open === section}
		onclick={() => (open = open === section ? null : section)}
	>
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
			aria-hidden="true"><Icon size={18} /></span
		>
		<span class="min-w-0 flex-1">
			<span class="block font-medium">{label}</span>
			<span class="block truncate text-sm text-slate-500">{value}</span>
		</span>
		<ChevronDown
			size={18}
			class="shrink-0 text-slate-400 transition-transform {open === section ? 'rotate-180' : ''}"
			aria-hidden="true"
		/>
	</button>
{/snippet}

{#snippet error(section: Section)}
	{#if form?.action === section && form.message}<p class="error">{form.message}</p>{/if}
{/snippet}

<div class="card mb-6 divide-y divide-slate-100 overflow-hidden">
	<div>
		{@render row('name', 'Name', data.user.name, UserRound)}
		{#if open === 'name'}
			<form
				method="POST"
				action="?/name"
				use:enhance={() =>
					({ update }) =>
						update({ reset: false })}
				class="space-y-3 px-4 pb-4"
			>
				{@render error('name')}
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
		{/if}
	</div>

	<div>
		{@render row('email', 'E-Mail-Adresse', data.user.email, Mail)}
		{#if open === 'email'}
			<form
				method="POST"
				action="?/email"
				use:enhance={({ formElement }) =>
					async ({ update }) => {
						// Keep the email in the field, but never leave the password behind.
						await update({ reset: false });
						const password = formElement.querySelector<HTMLInputElement>('[name=currentPassword]');
						if (password) password.value = '';
					}}
				class="space-y-3 px-4 pb-4"
			>
				{@render error('email')}
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
		{/if}
	</div>

	<div>
		{@render row('password', 'Passwort', 'Neues Passwort festlegen', KeyRound)}
		{#if open === 'password'}
			<form method="POST" action="?/password" use:enhance class="space-y-3 px-4 pb-4">
				{@render error('password')}
				<label class="block">
					<span class="label">Aktuelles Passwort</span>
					<input name="currentPassword" type="password" autocomplete="current-password" required />
				</label>
				<label class="block">
					<span class="label">Neues Passwort (mind. 10 Zeichen)</span>
					<input
						name="newPassword"
						type="password"
						autocomplete="new-password"
						required
						minlength="10"
					/>
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
		{/if}
	</div>

	<div>
		{@render row('delete', 'Konto löschen', 'Konto und eigene Daten entfernen', Trash2)}
		{#if open === 'delete'}
			<form
				method="POST"
				action="?/deleteAccount"
				use:enhance={({ cancel }) => {
					if (!confirm('Dein Konto wirklich endgültig löschen?')) cancel();
				}}
				class="space-y-3 px-4 pb-4"
			>
				{@render error('delete')}
				<p class="text-sm text-slate-600">
					Deine privaten Termine, Aufgaben und Ordner werden gelöscht. Was die Familie sieht, bleibt
					für die anderen erhalten. Familien, in denen du allein bist, werden mit gelöscht.
				</p>
				<label class="block">
					<span class="label">Aktuelles Passwort zur Bestätigung</span>
					<input name="currentPassword" type="password" autocomplete="current-password" required />
				</label>
				<button class="btn-secondary w-full text-red-600">Konto endgültig löschen</button>
			</form>
		{/if}
	</div>
</div>

<form method="POST" action="/logout" class="card overflow-hidden">
	<button
		class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left font-medium text-red-600"
	>
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50"
			aria-hidden="true"><LogOut size={18} /></span
		>
		Abmelden
	</button>
</form>
