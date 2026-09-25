<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import BlockView from '$lib/components/planning/BlockView.svelte';
	import TableEditor from '$lib/components/planning/TableEditor.svelte';
	import VisibilityBadge from '$lib/components/VisibilityBadge.svelte';
	import { shrinkImage } from '$lib/images';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type NewType = 'text' | 'table' | 'link' | 'image';
	let adding = $state<NewType | null>(null);
	let editingId = $state<string | null>(null);
	let renaming = $state(false);
	let uploading = $state(false);

	const addOptions: { type: NewType; label: string; icon: string }[] = [
		{ type: 'text', label: 'Text', icon: '📝' },
		{ type: 'table', label: 'Tabelle', icon: '📊' },
		{ type: 'link', label: 'Link', icon: '🔗' },
		{ type: 'image', label: 'Bild', icon: '🖼️' }
	];

	// Close the form after a successful save, keep it open (with the input) on errors.
	type AfterSubmit = Parameters<Exclude<Awaited<ReturnType<SubmitFunction>>, void>>[0];
	async function afterSave({ result, update }: AfterSubmit) {
		await update({ reset: false });
		if (result.type === 'success') {
			adding = null;
			editingId = null;
			renaming = false;
		}
	}
	const closeOnSuccess: SubmitFunction = () => afterSave;

	const uploadImage: SubmitFunction = async ({ formData }) => {
		uploading = true;
		const file = formData.get('file');
		if (file instanceof File && file.size > 0) formData.set('file', await shrinkImage(file));
		return async (opts) => {
			uploading = false;
			await afterSave(opts);
		};
	};

	let errorFor = $derived((blockId: string | null) =>
		form?.message && (form.blockId ?? null) === blockId ? form.message : null
	);
</script>

<svelte:head><title>{data.card.title} · Planung · MyFam</title></svelte:head>

<a href="/planung/{data.card.folderId}" class="mb-2 inline-block text-sm text-slate-500">
	← {data.card.folderName}
</a>

{#if renaming}
	<form method="POST" action="?/rename" use:enhance={closeOnSuccess} class="mb-4 flex gap-2">
		<!-- svelte-ignore a11y_autofocus -->
		<input name="title" value={data.card.title} required maxlength="100" autofocus class="flex-1" />
		<button class="btn-primary">OK</button>
	</form>
{:else}
	<div class="mb-4 flex items-start gap-2">
		<h1 class="flex-1 text-xl font-bold break-words">{data.card.title}</h1>
		<button
			class="px-2 py-1 text-slate-400"
			onclick={() => (renaming = true)}
			aria-label="Titel ändern">✎</button
		>
	</div>
{/if}
<div class="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
	<VisibilityBadge visibility={data.card.visibility} />
	{#if data.card.createdBy}<span>angelegt von {data.card.createdBy}</span>{/if}
</div>

{#if data.blocks.length === 0 && !adding}
	<p class="card p-6 text-center text-slate-500">
		Die Karte ist noch leer. Füge unten Text, eine Tabelle, einen Link oder ein Bild hinzu.
	</p>
{/if}

<ul class="space-y-3">
	{#each data.blocks as block, i (block.id)}
		<li class="card p-4">
			{#if editingId === block.id}
				<form method="POST" action="?/update" use:enhance={closeOnSuccess} class="space-y-3">
					<input type="hidden" name="blockId" value={block.id} />
					{#if block.type === 'text'}
						{@render textFields(block.data.text)}
					{:else if block.type === 'table'}
						<TableEditor rows={block.data.rows} />
					{:else if block.type === 'link'}
						{@render linkFields(block.data.url, block.data.title)}
					{:else if block.type === 'image'}
						<BlockView {block} />
						<input
							name="caption"
							value={block.data.caption}
							maxlength="200"
							placeholder="Bildunterschrift (optional)"
						/>
					{/if}
					{#if errorFor(block.id)}<p class="error">{errorFor(block.id)}</p>{/if}
					<div class="flex gap-2">
						<button class="btn-primary flex-1">Speichern</button>
						<button type="button" class="btn-secondary" onclick={() => (editingId = null)}>
							Abbrechen
						</button>
					</div>
				</form>
				<div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
					<div class="flex gap-1">
						{#each [{ dir: 'up', label: '↑ Nach oben', off: i === 0 }, { dir: 'down', label: '↓ Nach unten', off: i === data.blocks.length - 1 }] as move (move.dir)}
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="blockId" value={block.id} />
								<input type="hidden" name="direction" value={move.dir} />
								<button
									class="rounded px-2 py-1 text-slate-600 disabled:opacity-30"
									disabled={move.off}
								>
									{move.label}
								</button>
							</form>
						{/each}
					</div>
					<form
						method="POST"
						action="?/deleteBlock"
						use:enhance={({ cancel }) => {
							if (!confirm('Diesen Inhalt löschen?')) return cancel();
							return async ({ update }) => {
								editingId = null;
								await update();
							};
						}}
					>
						<input type="hidden" name="blockId" value={block.id} />
						<button class="px-2 py-1 text-red-600">Löschen</button>
					</form>
				</div>
			{:else}
				<div class="relative">
					<BlockView {block} />
					<button
						class="absolute -top-2 -right-2 rounded-full bg-white/80 px-2 py-1 text-slate-400"
						onclick={() => {
							editingId = block.id;
							adding = null;
						}}
						aria-label="Bearbeiten">✎</button
					>
				</div>
			{/if}
		</li>
	{/each}
</ul>

{#snippet textFields(text = '')}
	<!-- svelte-ignore a11y_autofocus -->
	<textarea name="text" rows="8" maxlength="20000" required autofocus class="w-full" value={text}
	></textarea>
	<p class="text-xs text-slate-500">
		Formatierung: **fett**, *kursiv*, # Überschrift, - Liste, 1. Nummeriert, - [ ] Aufgabe
	</p>
{/snippet}

{#snippet linkFields(url = '', title = '')}
	<div>
		<label class="label" for="link-url">Adresse</label>
		<input
			id="link-url"
			name="url"
			type="url"
			inputmode="url"
			required
			value={url}
			placeholder="https://…"
		/>
	</div>
	<div>
		<label class="label" for="link-title">Bezeichnung (optional)</label>
		<input
			id="link-title"
			name="title"
			maxlength="200"
			value={title}
			placeholder="z. B. Ferienwohnung"
		/>
	</div>
{/snippet}

{#if adding}
	<div class="card mt-3 p-4">
		{#if adding === 'image'}
			<form
				method="POST"
				action="?/image"
				enctype="multipart/form-data"
				use:enhance={uploadImage}
				class="space-y-3"
			>
				<h2 class="font-semibold">Bild hinzufügen</h2>
				<input name="file" type="file" accept="image/*" required class="w-full text-sm" />
				<input name="caption" maxlength="200" placeholder="Bildunterschrift (optional)" />
				<p class="text-xs text-slate-500">
					Große Fotos werden automatisch verkleinert. Maximal 10 MB.
				</p>
				{#if errorFor(null)}<p class="error">{errorFor(null)}</p>{/if}
				<div class="flex gap-2">
					<button class="btn-primary flex-1" disabled={uploading}>
						{uploading ? 'Wird hochgeladen …' : 'Hochladen'}
					</button>
					<button type="button" class="btn-secondary" onclick={() => (adding = null)}
						>Abbrechen</button
					>
				</div>
			</form>
		{:else}
			<form method="POST" action="?/add" use:enhance={closeOnSuccess} class="space-y-3">
				<input type="hidden" name="type" value={adding} />
				<h2 class="font-semibold">
					{adding === 'text' ? 'Text' : adding === 'table' ? 'Tabelle' : 'Link'} hinzufügen
				</h2>
				{#if adding === 'text'}
					{@render textFields()}
				{:else if adding === 'table'}
					<TableEditor />
				{:else}
					{@render linkFields()}
				{/if}
				{#if errorFor(null)}<p class="error">{errorFor(null)}</p>{/if}
				<div class="flex gap-2">
					<button class="btn-primary flex-1">Hinzufügen</button>
					<button type="button" class="btn-secondary" onclick={() => (adding = null)}
						>Abbrechen</button
					>
				</div>
			</form>
		{/if}
	</div>
{:else}
	<div class="mt-4 grid grid-cols-4 gap-2">
		{#each addOptions as option (option.type)}
			<button
				class="card flex flex-col items-center gap-1 py-3 text-xs text-slate-700 active:bg-slate-50"
				onclick={() => {
					adding = option.type;
					editingId = null;
				}}
			>
				<span class="text-xl" aria-hidden="true">{option.icon}</span>
				+ {option.label}
			</button>
		{/each}
	</div>
{/if}

<form
	method="POST"
	action="?/deleteCard"
	class="mt-10 text-center"
	use:enhance={({ cancel }) => {
		if (!confirm(`Karte „${data.card.title}“ löschen?`)) cancel();
	}}
>
	<button class="text-sm text-red-600 underline">Karte löschen</button>
</form>
