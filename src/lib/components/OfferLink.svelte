<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
	import { offerLink, type Offer } from '$lib/offers';

	let { offer }: { offer: Pick<Offer, 'store' | 'source' | 'url' | 'brand'> } = $props();
	let link = $derived(offerLink(offer));
</script>

<a
	href={link.href}
	target="_blank"
	rel="noopener noreferrer"
	class="link mt-1 inline-flex items-center gap-1 text-xs"
	>{link.label} <ExternalLink size={12} aria-hidden="true" /></a
>
