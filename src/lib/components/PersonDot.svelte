<script lang="ts">
	import { page } from '$app/state';
	import { colorHex } from '$lib/colors';

	// A small dot in the member's colour. Looks the member up by id, or by name where a row only
	// carries the name (e.g. "von Anna" on the shopping list).
	let {
		id = null,
		name = null,
		size = 8
	}: { id?: string | null; name?: string | null; size?: number } = $props();

	let members = $derived(
		(page.data.memberColors ?? []) as { id: string; name: string; color: string }[]
	);
	let hex = $derived(
		colorHex((members.find((m) => (id ? m.id === id : m.name === name)) ?? null)?.color)
	);
</script>

{#if hex}
	<span
		class="inline-block shrink-0 rounded-full"
		style="width: {size}px; height: {size}px; background: {hex}"
		aria-hidden="true"
	></span>
{/if}
