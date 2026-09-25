<script lang="ts">
	import { Link } from '@lucide/svelte';
	import { renderText } from '$lib/format';
	import type { Block } from '$lib/planning';

	let { block }: { block: Block } = $props();

	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};
</script>

{#if block.type === 'text'}
	<!-- renderText escapes all HTML before adding its own tags. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class="rich">{@html renderText(block.data.text)}</div>
{:else if block.type === 'table'}
	<div class="-mx-1 overflow-x-auto px-1">
		<table class="w-full border-collapse text-sm">
			<thead>
				<tr>
					{#each block.data.rows[0] as cell, c (c)}
						<th class="border-b-2 border-slate-200 px-2 py-1.5 text-left font-semibold">{cell}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each block.data.rows.slice(1) as row, r (r)}
					<tr>
						{#each row as cell, c (c)}
							<td class="border-b border-slate-100 px-2 py-1.5 align-top whitespace-pre-line"
								>{cell}</td
							>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if block.type === 'link'}
	<a
		href={block.data.url}
		target="_blank"
		rel="noopener noreferrer"
		class="flex items-center gap-3 rounded-xl bg-slate-50 p-3 active:bg-slate-100"
	>
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"
			aria-hidden="true"><Link size={18} /></span
		>
		<span class="min-w-0 flex-1">
			<span class="block truncate font-medium text-brand-700">
				{block.data.title || host(block.data.url)}
			</span>
			<span class="block truncate text-xs text-slate-500">{block.data.url}</span>
		</span>
	</a>
{:else if block.type === 'image'}
	<figure>
		<a href="/planung/bild/{block.data.imageId}" target="_blank" rel="noopener">
			<img
				src="/planung/bild/{block.data.imageId}"
				alt={block.data.caption || 'Bild'}
				loading="lazy"
				class="max-h-[70vh] w-full rounded-xl bg-slate-100 object-contain"
			/>
		</a>
		{#if block.data.caption}
			<figcaption class="mt-1 text-center text-sm text-slate-500">{block.data.caption}</figcaption>
		{/if}
	</figure>
{/if}
