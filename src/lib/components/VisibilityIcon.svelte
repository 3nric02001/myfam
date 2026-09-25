<script lang="ts">
	import type { Visibility } from '$lib/server/db/schema';
	import { visibilityIcon } from '$lib/visibility';

	let {
		visibility,
		size = 18,
		...rest
	}: { visibility: Visibility; size?: number; class?: string; strokeWidth?: number } = $props();

	let Icon = $derived(visibilityIcon[visibility]);
</script>

<Icon {size} {...rest} aria-hidden="true" />
