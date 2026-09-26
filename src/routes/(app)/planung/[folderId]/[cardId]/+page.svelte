<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		ChevronLeft,
		Image,
		Link,
		Pencil,
		Table2,
		Trash2,
		Type
	} from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import BlockView from '$lib/components/planning/BlockView.svelte';
	import Comments from '$lib/components/planning/Comments.svelte';
	import TableEditor from '$lib/components/planning/TableEditor.svelte';
	import VisibilityBadge from '$lib/components/VisibilityBadge.svelte';
	import { shrinkImage } from '$lib/images';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type NewType = 'text' | 'table' | 'link' | 'image';
	// The composer at the bottom starts on text, the most common kind of content.
	let adding = $state<NewType>('text');
	// Only move the focus (and open the phone keyboard) after the user picked a kind.
	let picked = $state(false);
	let editingId = $state<string | null>(null);
	let renaming = $state(false);
	let uploading = $state(false);

	const addOptions: { type: NewType; label: string; icon: typeof Type }[] = [
		{ type: 'text', label: 'Text', icon: Type },
		{ type: 'table', label: 'Tabelle', icon: Table2 },
		{ type: 'link', label: 'Link', icon: Link },
		{ type: 'image', label: 'Bild', icon: Image }
	];

	function pick(type: NewType) {
		adding = type;
		picked = true;
	}

	// Close the form after a successful save, keep it open (with the input) on errors.
	type AfterSubmit = Parameters<Exclude<Awaited<ReturnType<SubmitFunction>>, void>>[0];
	async function afterSave({ result, update }: AfterSubmit) {
		// Clear the composer after adding, but keep edits in place on errors.
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			adding = 'text';
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
		form && 'message' in form && form.message && (form.blockId ?? null) === blockId
			? form.message
			: null
	);
</script>

<svelte:head><title>{data.card.title} · Planung · MyFam</title></svelte:head>

<a
	href="/planung/{data.card.folderId}"
	class="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"
>
	<ChevronLeft size={16} aria-hidden="true" />
	{data.card.folderName}
</a>

{#if renaming}
	<form method="POST" action="?/rename" use:enhance={closeOnSuccess} class="mb-4 flex gap-2">
		<!-- svelte-ignore a11y_autofocus -->
		<input name="title" value={data.card.title} required maxlength="100" autofocus class="flex-1" />
		<button class="btn-primary">OK</button>
	</form>
{:else}
	<div class="mb-4 flex items-start gap-2">
		<h1 class="flex-1 text-xl font-semibold tracking-tight break-words">{data.card.title}</h1>
		<button class="icon-btn -mt-1.5" onclick={() => (renaming = true)} aria-label="Titel ändern"
			><Pencil size={18} aria-hidden="true" /></button
		>
	</div>
{/if}
<div class="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
	<VisibilityBadge visibility={data.card.visibility} />
	{#if data.card.createdBy}<span>angelegt von {data.card.createdBy}</span>{/if}
</div>

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
						{#each [{ dir: 'up', label: 'Nach oben', icon: ArrowUp, off: i === 0 }, { dir: 'down', label: 'Nach unten', icon: ArrowDown, off: i === data.blocks.length - 1 }] as move (move.dir)}
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="blockId" value={block.id} />
								<input type="hidden" name="direction" value={move.dir} />
								<button
									class="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-600 disabled:opacity-30"
									disabled={move.off}
								>
									<move.icon size={16} aria-hidden="true" />
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
						<button class="flex items-center gap-1 px-2 py-1 text-red-600"
							><Trash2 size={16} aria-hidden="true" /> Löschen</button
						>
					</form>
				</div>
			{:else}
				<div class="relative">
					<BlockView {block} />
					<button
						class="icon-btn absolute -top-3 -right-3 bg-surface/80"
						onclick={() => (editingId = block.id)}
						aria-label="Bearbeiten"><Pencil size={16} aria-hidden="true" /></button
					>
				</div>
			{/if}
		</li>
	{/each}
</ul>

{#snippet textFields(text = '', focus = true, rows = 8)}
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		name="text"
		{rows}
		maxlength="20000"
		required
		autofocus={focus}
		class="w-full"
		value={text}
		placeholder="Schreib etwas …"></textarea>
	<p class="text-xs text-slate-400">
		Formatierung: **fett**, *kursiv*, # Überschrift, - Liste, 1. Nummeriert, - [ ] Aufgabe
	</p>
{/snippet}

{#snippet linkFields(url = '', title = '')}
	<div>
		<label class="label" for="link-url">Adresse</label>
		<input
			id="link-url"
			name="url"
			inputmode="url"
			autocapitalize="off"
			autocomplete="url"
			required
			value={url}
			placeholder="z. B. www.beispiel.de"
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

{#if !editingId}
	<div class="card mt-3 p-3">
		<div class="mb-2 flex gap-1" role="tablist" aria-label="Was möchtest du hinzufügen?">
			{#each addOptions as option (option.type)}
				<button
					type="button"
					role="tab"
					aria-selected={adding === option.type}
					class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs {adding === option.type
						? 'bg-brand-100 font-semibold text-brand-800'
						: 'text-slate-500 active:bg-slate-100'}"
					onclick={() => pick(option.type)}
				>
					<option.icon size={14} aria-hidden="true" />
					{option.label}
				</button>
			{/each}
		</div>

		{#if adding === 'image'}
			<form
				method="POST"
				action="?/image"
				enctype="multipart/form-data"
				use:enhance={uploadImage}
				class="space-y-3"
			>
				<input name="file" type="file" accept="image/*" required class="w-full text-sm" />
				<input name="caption" maxlength="200" placeholder="Bildunterschrift (optional)" />
				<p class="text-xs text-slate-400">
					Große Fotos werden automatisch verkleinert. Maximal 10 MB.
				</p>
				{#if errorFor(null)}<p class="error">{errorFor(null)}</p>{/if}
				<button class="btn-primary w-full" disabled={uploading}>
					{uploading ? 'Wird hochgeladen …' : 'Bild hochladen'}
				</button>
			</form>
		{:else}
			{#key adding}
				<form method="POST" action="?/add" use:enhance={closeOnSuccess} class="space-y-3">
					<input type="hidden" name="type" value={adding} />
					{#if adding === 'text'}
						{@render textFields('', picked, 4)}
					{:else if adding === 'table'}
						<TableEditor />
					{:else}
						{@render linkFields()}
					{/if}
					{#if errorFor(null)}<p class="error">{errorFor(null)}</p>{/if}
					<button class="btn-primary w-full">Hinzufügen</button>
				</form>
			{/key}
		{/if}
	</div>
{/if}

<Comments
	comments={data.comments}
	error={form && 'commentError' in form ? form.commentError : null}
	errorFor={form && 'commentId' in form ? form.commentId : null}
/>

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
