<script lang="ts">
	import { X } from '@lucide/svelte';
	// Editable grid. The first row is the header. Submits the cells as JSON in the `rows` field.
	let { rows: initial = [] }: { rows?: string[][] } = $props();

	const MAX_ROWS = 100;
	const MAX_COLS = 12;

	// svelte-ignore state_referenced_locally
	let rows = $state(
		initial.length
			? initial.map((r) => [...r])
			: [
					['', ''],
					['', '']
				]
	);
	let cols = $derived(rows[0]?.length ?? 0);

	const addRow = () => rows.push(Array(cols).fill(''));
	const addCol = () => rows.forEach((r) => r.push(''));
	const removeRow = (i: number) => rows.length > 1 && rows.splice(i, 1);
	const removeCol = (i: number) => cols > 1 && rows.forEach((r) => r.splice(i, 1));
</script>

<input type="hidden" name="rows" value={JSON.stringify(rows)} />

<div class="-mx-1 overflow-x-auto px-1 pb-1">
	<table class="border-separate border-spacing-1">
		<thead>
			<tr>
				{#each rows[0], c (c)}
					<th class="p-0">
						<button
							type="button"
							class="w-full text-xs text-slate-500 disabled:opacity-30"
							disabled={cols === 1}
							onclick={() => removeCol(c)}
							aria-label="Spalte {c + 1} entfernen"
							><X size={14} class="mx-auto" aria-hidden="true" /></button
						>
					</th>
				{/each}
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row, r (r)}
				<tr>
					{#each row, c (c)}
						<td class="p-0">
							<input
								bind:value={rows[r][c]}
								maxlength="500"
								aria-label={r === 0 ? `Überschrift Spalte ${c + 1}` : `Zeile ${r}, Spalte ${c + 1}`}
								placeholder={r === 0 ? 'Überschrift' : ''}
								class="min-w-28 px-2 py-1.5 text-sm {r === 0 ? 'font-semibold' : ''}"
							/>
						</td>
					{/each}
					<td class="p-0">
						<button
							type="button"
							class="px-1 text-xs text-slate-500 disabled:opacity-30"
							disabled={rows.length === 1}
							onclick={() => removeRow(r)}
							aria-label="Zeile {r + 1} entfernen"
							><X size={14} class="mx-auto" aria-hidden="true" /></button
						>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<div class="mt-2 flex gap-2 text-sm">
	<button
		type="button"
		class="btn-secondary min-h-9 py-1"
		onclick={addRow}
		disabled={rows.length >= MAX_ROWS}
	>
		+ Zeile
	</button>
	<button
		type="button"
		class="btn-secondary min-h-9 py-1"
		onclick={addCol}
		disabled={cols >= MAX_COLS}
	>
		+ Spalte
	</button>
</div>
