<script lang="ts">
	import { enhance } from '$app/forms';
	import VisibilityBadge from '$lib/components/VisibilityBadge.svelte';
	import VisibilityPicker from '$lib/components/VisibilityPicker.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let creating = $state(false);
</script>

<svelte:head><title>Planung · MyFam</title></svelte:head>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-xl font-bold">Planung</h1>
	{#if !creating}
		<button class="btn-primary" onclick={() => (creating = true)}>+ Ordner</button>
	{/if}
</div>

{#if creating}
	<form method="POST" action="?/create" use:enhance class="card mb-5 space-y-4">
		<h2 class="font-semibold">Neuer Ordner</h2>
		<div>
			<label class="label" for="folder-name">Name</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="folder-name"
				name="name"
				required
				maxlength="60"
				placeholder="z. B. Urlaub 2027"
				autofocus
			/>
		</div>
		<VisibilityPicker
			members={data.members.filter((m) => m.id !== data.user.id)}
			noun="den Ordner"
		/>
		{#if form?.message}<p class="error">{form.message}</p>{/if}
		<div class="flex gap-2">
			<button class="btn-primary flex-1">Anlegen</button>
			<button type="button" class="btn-secondary" onclick={() => (creating = false)}>
				Abbrechen
			</button>
		</div>
	</form>
{/if}

{#if data.folders.length === 0 && !creating}
	<div class="card p-6 text-center text-slate-500">
		<p class="text-3xl" aria-hidden="true">🗂️</p>
		<p class="mt-2">
			Noch keine Ordner. Lege einen an, z. B. für den Urlaub, Geschenkideen oder Rezepte.
		</p>
	</div>
{/if}

<ul class="grid grid-cols-2 gap-3">
	{#each data.folders as folder (folder.id)}
		<li>
			<a
				href="/planung/{folder.id}"
				class="card flex h-full min-h-28 flex-col justify-between p-3 active:bg-slate-50"
			>
				<span>
					<span class="text-2xl" aria-hidden="true">📁</span>
					<span class="mt-1 block font-semibold break-words">{folder.name}</span>
					<span class="block text-xs text-slate-500">
						{folder.cards}
						{folder.cards === 1 ? 'Karte' : 'Karten'}
						{#if folder.createdBy && folder.createdById !== data.user.id}· von {folder.createdBy}{/if}
					</span>
				</span>
				<span class="mt-2"><VisibilityBadge visibility={folder.visibility} /></span>
			</a>
		</li>
	{/each}
</ul>
