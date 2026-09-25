<script lang="ts">
	let {
		visibility,
		sharedWith = []
	}: { visibility: 'family' | 'shared' | 'private'; sharedWith?: string[] } = $props();

	let text = $derived(
		visibility === 'family'
			? 'Familie'
			: visibility === 'private'
				? 'Nur ich'
				: sharedWith.length
					? `Mit ${sharedWith.join(', ')}`
					: 'Geteilt'
	);
</script>

<span
	class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
	title="Sichtbar für: {text}"
>
	<span aria-hidden="true"
		>{visibility === 'family' ? '👪' : visibility === 'private' ? '🔒' : '👥'}</span
	>
	{text}
</span>
