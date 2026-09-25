<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let isAdmin = $derived(data.family?.role === 'admin');
	let copied = $state(false);

	async function share(url: string) {
		if (navigator.share) {
			await navigator.share({ title: 'Einladung zu MyFam', url }).catch(() => {});
		} else {
			await navigator.clipboard.writeText(url);
			copied = true;
		}
	}
</script>

<svelte:head><title>Familie · MyFam</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">Familie</h1>
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
						<button class="text-xs text-emerald-700 underline">
							{member.role === 'admin' ? 'Zum Mitglied' : 'Zum Admin'}
						</button>
					</form>
					<form
						method="POST"
						action="?/remove"
						use:enhance={({ cancel }) => {
							if (!confirm(`${member.name} wirklich aus der Familie entfernen?`)) cancel();
						}}
					>
						<input type="hidden" name="userId" value={member.id} />
						<button class="p-1 text-slate-400" aria-label="{member.name} entfernen">✕</button>
					</form>
				{/if}
			</li>
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
				{copied ? 'Link kopiert ✓' : 'Link teilen'}
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

{#if data.families.length > 1}
	<section class="card mb-5 p-4">
		<h2 class="mb-2 font-semibold">Familie wechseln</h2>
		<div class="flex flex-wrap gap-2">
			{#each data.families as f (f.id)}
				<form method="POST" action="?/switch" use:enhance>
					<input type="hidden" name="familyId" value={f.id} />
					<button
						class="rounded-full border px-3 py-1 text-sm {f.id === data.family?.id
							? 'border-emerald-600 bg-emerald-50 text-emerald-800'
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
