<script lang="ts">
	import { Check, ChevronRight, KeyRound, Share2, X } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { STATES } from '$lib/holidays';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let isAdmin = $derived(data.family?.role === 'admin');
	let copied = $state(false);

	async function share(url: string, title = 'Einladung zu MyFam') {
		if (navigator.share) {
			await navigator.share({ title, url }).catch(() => {});
		} else {
			await navigator.clipboard.writeText(url);
			copied = true;
		}
	}
</script>

<svelte:head><title>Familie · MyFam</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold tracking-tight">Familie</h1>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}

<section class="card mb-5 px-3">
	<h2 class="pt-3 text-sm font-semibold text-slate-500">Mitglieder</h2>
	<ul>
		{#each data.members as member (member.id)}
			<li class="flex items-center gap-2 border-b border-slate-100 py-3 last:border-0">
				<div class="flex-1">
					<p>
						{member.name}
						{#if member.id === data.user.id}<span class="text-xs text-slate-400">(du)</span>{/if}
					</p>
					<p class="text-xs text-slate-500">{member.email}</p>
				</div>
				<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
					{member.role === 'admin' ? 'Admin' : 'Mitglied'}
				</span>
				{#if isAdmin && member.id !== data.user.id}
					<form method="POST" action="?/role" use:enhance>
						<input type="hidden" name="userId" value={member.id} />
						<input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
						<button class="text-xs text-brand-700 underline">
							{member.role === 'admin' ? 'Zum Mitglied' : 'Zum Admin'}
						</button>
					</form>
					{#if data.resettable.includes(member.id)}
						<form method="POST" action="?/resetLink" use:enhance>
							<input type="hidden" name="userId" value={member.id} />
							<button
								class="icon-btn"
								aria-label="Link zum Zurücksetzen des Passworts für {member.name}"
								title="Passwort vergessen? Link erstellen"
								><KeyRound size={18} aria-hidden="true" /></button
							>
						</form>
					{/if}
					<form
						method="POST"
						action="?/remove"
						use:enhance={({ cancel }) => {
							if (!confirm(`${member.name} wirklich aus der Familie entfernen?`)) cancel();
						}}
					>
						<input type="hidden" name="userId" value={member.id} />
						<button class="icon-btn" aria-label="{member.name} entfernen"
							><X size={18} aria-hidden="true" /></button
						>
					</form>
				{/if}
			</li>
			{#if form && 'resetFor' in form && form.resetFor === member.id}
				<li class="space-y-2 border-b border-slate-100 pb-3">
					<p class="text-sm text-slate-600">
						Mit diesem Link legt {member.name} ein neues Passwort fest. Er gilt 24 Stunden und nur einmal.
					</p>
					<input
						readonly
						value={form.resetUrl}
						class="w-full text-sm"
						onfocus={(e) => e.currentTarget.select()}
					/>
					<button
						class="btn-secondary w-full"
						onclick={() => share(form.resetUrl, 'Neues Passwort für MyFam')}
					>
						{#if copied}<Check size={18} aria-hidden="true" /> Link kopiert{:else}<Share2
								size={18}
								aria-hidden="true"
							/> Link teilen{/if}
					</button>
				</li>
			{/if}
		{/each}
	</ul>
</section>

{#if isAdmin}
	<section class="card mb-5 space-y-3 p-4">
		<h2 class="font-semibold">Jemanden einladen</h2>
		<p class="text-sm text-slate-500">
			Der Link gilt 7 Tage und kann einmal benutzt werden. Schick ihn per Messenger an die Person.
		</p>
		{#if form && 'inviteUrl' in form && form.inviteUrl}
			<input
				readonly
				value={form.inviteUrl}
				class="w-full text-sm"
				onfocus={(e) => e.currentTarget.select()}
			/>
			<button class="btn-primary w-full" onclick={() => share(form.inviteUrl)}>
				{#if copied}<Check size={18} aria-hidden="true" /> Link kopiert{:else}<Share2
						size={18}
						aria-hidden="true"
					/> Link teilen{/if}
			</button>
		{:else}
			<form
				method="POST"
				action="?/invite"
				use:enhance={() =>
					async ({ update }) => {
						copied = false;
						await update();
					}}
			>
				<button class="btn-primary w-full">Einladungslink erstellen</button>
			</form>
		{/if}
	</section>
{/if}

<section id="feiertage" class="card mb-5 space-y-2 p-4">
	<h2 class="font-semibold">Feiertage im Kalender</h2>
	{#if isAdmin}
		<p class="text-sm text-slate-500">
			Bundesweite Feiertage werden immer angezeigt. Wählt euer Bundesland, um auch die regionalen zu
			sehen.
		</p>
		<form
			method="POST"
			action="?/state"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
				}}
			class="flex gap-2"
		>
			<select name="state" class="flex-1" value={data.state ?? ''}>
				<option value="">Nur bundesweite Feiertage</option>
				{#each Object.entries(STATES) as [code, name] (code)}
					<option value={code}>{name}</option>
				{/each}
			</select>
			<button class="btn-primary">Speichern</button>
		</form>
		{#if form && 'stateSaved' in form}<p class="flex items-center gap-1 text-sm text-brand-700">
				<Check size={16} aria-hidden="true" /> Gespeichert
			</p>{/if}
	{:else}
		<p class="text-sm text-slate-600">
			{data.state ? `Bundesweit und ${STATES[data.state]}` : 'Nur bundesweite Feiertage'}. Das kann
			ein Admin ändern.
		</p>
	{/if}
</section>

<a href="/kalender/abos" class="card mb-5 flex items-center gap-3 p-4">
	<span class="flex-1">
		<span class="block font-semibold">Kalender-Abos</span>
		<span class="block text-sm text-slate-500">Nextcloud- oder andere Kalender einbinden</span>
	</span>
	<ChevronRight size={20} class="text-slate-400" aria-hidden="true" />
</a>

{#if data.families.length > 1}
	<section class="card mb-5 p-4">
		<h2 class="mb-2 font-semibold">Familie wechseln</h2>
		<div class="flex flex-wrap gap-2">
			{#each data.families as f (f.id)}
				<form method="POST" action="?/switch" use:enhance>
					<input type="hidden" name="familyId" value={f.id} />
					<button
						class="rounded-full border px-3 py-1 text-sm {f.id === data.family?.id
							? 'border-brand-600 bg-brand-50 text-brand-800'
							: 'border-slate-300'}"
						disabled={f.id === data.family?.id}>{f.name}</button
					>
				</form>
			{/each}
		</div>
	</section>
{/if}

<section class="space-y-3">
	<a href="/familie/neu" class="btn-secondary block w-full text-center">Weitere Familie anlegen</a>
	<form
		method="POST"
		action="?/remove"
		use:enhance={({ cancel }) => {
			if (!confirm('Willst du die Familie wirklich verlassen?')) cancel();
		}}
	>
		<input type="hidden" name="userId" value={data.user.id} />
		<button class="btn-secondary w-full">Familie verlassen</button>
	</form>
	<form method="POST" action="/logout">
		<button class="btn-secondary w-full">Abmelden</button>
	</form>
</section>

{#if isAdmin}
	<details class="card mt-5 p-4" open={!!(form && 'deleteError' in form)}>
		<summary class="cursor-pointer font-semibold text-red-600">Familie löschen</summary>
		<form
			method="POST"
			action="?/deleteFamily"
			use:enhance={({ cancel }) => {
				if (!confirm(`„${data.family?.name}“ mit allen Inhalten endgültig löschen?`)) cancel();
			}}
			class="mt-3 space-y-3"
		>
			<p class="text-sm text-slate-600">
				Löscht die Familie mit allen Terminen, Aufgaben, Listen, Ordnern und Bildern für alle
				Mitglieder. Die Konten der Mitglieder bleiben bestehen.
			</p>
			{#if form && 'deleteError' in form}<p class="error">{form.deleteError}</p>{/if}
			<label class="block">
				<span class="label">Zur Bestätigung den Namen „{data.family?.name}“ eingeben</span>
				<input name="confirmName" required autocomplete="off" />
			</label>
			<button class="btn-secondary w-full text-red-600">Familie endgültig löschen</button>
		</form>
	</details>
{/if}
