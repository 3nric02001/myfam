<script lang="ts">
	import { Camera, ChevronLeft, History, LoaderCircle } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { formatPrice, STORES } from '$lib/offers';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let reading = $state(false);
	let receipt = $derived(form && 'receipt' in form ? form.receipt : null);

	/**
	 * Phone photos are large and often stored sideways. Drawing them on a canvas turns them
	 * upright and makes the upload small; if that fails, the original goes up.
	 */
	async function shrink(file: File) {
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
			return blob ? new File([blob], 'kassenzettel.jpg', { type: 'image/jpeg' }) : file;
		} catch {
			return file;
		}
	}
</script>

<svelte:head><title>Kassenzettel · MyFam</title></svelte:head>

<a href="/einkauf" class="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"
	><ChevronLeft size={16} aria-hidden="true" /> Einkaufsliste</a
>
<div class="mb-1 flex items-center gap-2">
	<h1 class="min-w-0 flex-1 text-xl font-semibold tracking-tight">Kassenzettel</h1>
	<a
		href="/einkauf/verlauf"
		class="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-300 px-3 text-sm font-medium text-slate-700"
		><History size={16} aria-hidden="true" /> Verlauf</a
	>
</div>
<p class="mb-4 text-sm text-slate-500">
	Fotografiere den Bon nach dem Einkauf. MyFam liest die Preise und merkt sie sich für die Schätzung
	des nächsten Einkaufs. Der Einkauf landet im Verlauf, das Foto selbst wird nicht gespeichert.
</p>
{#if form?.message}<p class="error mb-4">{form.message}</p>{/if}
{#if form && 'saved' in form}
	<p class="success mb-4">
		{form.saved}
		{form.saved === 1 ? 'Preis' : 'Preise'} gemerkt.
		{#if form.purchaseId}
			<a href="/einkauf/verlauf/{form.purchaseId}" class="underline">Einkauf ansehen</a> ·
		{/if}
		<a href="/einkauf" class="underline">Zur Einkaufsliste</a>
	</p>
{/if}

<form
	method="POST"
	action="?/read"
	enctype="multipart/form-data"
	class="card mb-5 p-4"
	use:enhance={async ({ formData }) => {
		const photo = formData.get('photo');
		if (photo instanceof File && photo.size) formData.set('photo', await shrink(photo));
		reading = true;
		return async ({ update }) => {
			await update();
			reading = false;
		};
	}}
>
	<label class="btn-primary flex cursor-pointer items-center justify-center gap-2">
		{#if reading}
			<LoaderCircle size={20} class="animate-spin" aria-hidden="true" /> Lese den Kassenzettel …
		{:else}
			<Camera size={20} aria-hidden="true" /> Kassenzettel fotografieren
		{/if}
		<input
			type="file"
			name="photo"
			accept="image/*"
			capture="environment"
			class="sr-only"
			disabled={reading}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		/>
	</label>
</form>

{#if receipt}
	<form method="POST" action="?/save" use:enhance class="card p-4">
		<h2 class="mb-3 font-semibold">Erkannte Preise prüfen</h2>
		<div class="mb-4 grid grid-cols-2 gap-2">
			<label>
				<span class="label">Markt</span>
				<select
					name="store"
					required
					class="w-full"
					value={receipt.store ?? data.preferred[0] ?? ''}
				>
					<option value="" disabled>Bitte wählen</option>
					{#each STORES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
				</select>
			</label>
			<label>
				<span class="label">Eingekauft am</span>
				<input
					type="date"
					name="date"
					required
					max={data.today}
					value={receipt.date}
					class="w-full"
				/>
			</label>
		</div>
		<p class="mb-2 text-xs text-slate-500">
			Stimmt ein Name nicht, ändere ihn so, wie er auf deiner Liste steht. Nur angehakte Zeilen
			werden gemerkt.
		</p>
		<input type="hidden" name="lines" value={receipt.lines.length} />
		<ul>
			{#each receipt.lines as line, i (i)}
				<li class="flex items-start gap-2 border-b border-slate-100 py-2 last:border-0">
					<input
						type="checkbox"
						name="keep-{i}"
						checked
						class="mt-3"
						aria-label="{line.name} merken"
					/>
					<div class="min-w-0 flex-1">
						<div class="flex gap-2">
							<input
								name="name-{i}"
								value={line.name}
								maxlength="100"
								class="min-w-0 flex-1"
								aria-label="Artikel"
							/>
							<input
								name="price-{i}"
								value={formatPrice(line.price).replace(/\s*€/, '')}
								inputmode="decimal"
								maxlength="10"
								class="w-20 text-right"
								aria-label="Preis für {line.name}"
							/>
						</div>
						<input type="hidden" name="product-{i}" value={line.product} />
						<input type="hidden" name="count-{i}" value={line.count} />
						<input type="hidden" name="weighed-{i}" value={line.weighed ? '1' : '0'} />
						<span class="mt-0.5 block text-xs text-slate-500">
							Bon: {line.text}{#if line.count > 1}&nbsp;· {line.count} Stück{/if}{#if line.weighed}&nbsp;·
								nach Gewicht{/if}{#if !line.known}&nbsp;· nicht auf der Liste{/if}
						</span>
					</div>
				</li>
			{/each}
		</ul>
		<button class="btn-primary mt-4 w-full">Preise merken</button>
	</form>
{/if}
