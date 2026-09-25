<script lang="ts">
	import type { Visibility } from '$lib/server/db/schema';
	import { visibilityLabel } from '$lib/visibility';
	import VisibilityIcon from './VisibilityIcon.svelte';

	let { visibility, sharedWith = [] }: { visibility: Visibility; sharedWith?: string[] } = $props();

	let text = $derived(
		visibility === 'shared' && sharedWith.length
			? `Mit ${sharedWith.join(', ')}`
			: visibilityLabel[visibility]
	);
</script>

<span
	class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
	title="Sichtbar für: {text}"
>
	<VisibilityIcon {visibility} size={13} />
	{text}
</span>
