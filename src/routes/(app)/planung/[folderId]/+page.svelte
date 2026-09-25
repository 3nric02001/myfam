<script lang="ts">
	import { enhance } from '$app/forms';
	import VisibilityBadge from '$lib/components/VisibilityBadge.svelte';
	import VisibilityPicker from '$lib/components/VisibilityPicker.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let editing = $state(false);

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
</script>

<svelte:head><title>{data.folder.name} · Planung · MyFam</title></svelte:head>

<a href="/planung" class="mb-2 inline-block text-sm text-slate-500">← Planung</a>

<div class="mb-4 flex items-start gap-2">
	<div class="flex-1">
		<h1 class="text-xl font-bold break-words">{data.folder.name}</h1>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
			<VisibilityBadge
				visibility={data.folder.visibility}
				sharedWith={data.folder.sharedWith.map((s) => s.name)}
			/>
			{#if data.folder.createdBy}<span>angelegt von {data.folder.createdBy}</span>{/if}
		</div>
	</div>
	{#if data.folder.canManage && !editing}
		<button
			class="btn-secondary px-3"
			onclick={() => (editing = true)}
			aria-label="Ordner bearbeiten"
		>
			✎
		</button>
	{/if}
</div>

{#if editing}
	<form
		method="POST"
		action="?/update"
		class="card mb-5 space-y-4"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
			}}
	>
		<h2 class="font-semibold">Ordner bearbeiten</h2>
		<div>
			<label class="label" for="folder-name">Name</label>
			<input id="folder-name" name="name" required maxlength="60" value={data.folder.name} />
		</div>
		<VisibilityPicker
			members={data.members.filter((m) => m.id !== data.folder.createdById)}
			visibility={data.folder.visibility}
			sharedWith={data.folder.sharedWith.map((s) => s.id)}
			lockVisibility={!data.folder.isCreator}
			noun="den Ordner"
		/>
		{#if form?.message}<p class="error">{form.message}</p>{/if}
		<div class="flex gap-2">
			<button class="btn-primary flex-1">Speichern</button>
			<button type="button" class="btn-secondary" onclick={() => (editing = false)}>
				Abbrechen
			</button>
		</div>
	</form>
	<form
		method="POST"
		action="?/delete"
		class="mb-6 text-center"
		use:enhance={({ cancel }) => {
			if (!confirm(`Ordner „${data.folder.name}“ mit allen Karten löschen?`)) cancel();
		}}
	>
		<button class="text-sm text-red-600 underline">Ordner löschen</button>
	</form>
{:else if form?.message}
	<p class="error mb-4">{form.message}</p>
{/if}

<form method="POST" action="?/addCard" use:enhance class="card mb-5 flex gap-2 p-3">
	<input
		name="title"
		placeholder="Neue Karte, z. B. Packliste"
		required
		maxlength="100"
		class="flex-1"
	/>
	<button class="btn-primary px-4" aria-label="Karte anlegen">+</button>
</form>

{#if data.cards.length === 0}
	<p class="py-10 text-center text-slate-500">Noch keine Karten in diesem Ordner.</p>
{:else}
	<ul class="space-y-2">
		{#each data.cards as card (card.id)}
			<li>
				<a
					href="/planung/{data.folder.id}/{card.id}"
					class="card flex items-center gap-3 p-4 active:bg-slate-50"
				>
					<span class="text-xl" aria-hidden="true">🗒️</span>
					<span class="flex-1">
						<span class="block font-medium break-words">{card.title}</span>
						<span class="block text-xs text-slate-500">
							{card.blocks}
							{card.blocks === 1 ? 'Inhalt' : 'Inhalte'} · geändert {dateFormat.format(
								card.updatedAt
							)}
						</span>
					</span>
					<span class="text-slate-400" aria-hidden="true">›</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}
