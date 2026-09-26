<script lang="ts">
	import {
		Apple,
		Baby,
		Beef,
		Candy,
		Croissant,
		CupSoda,
		Droplets,
		Milk,
		Package,
		ShoppingBasket,
		Snowflake,
		SprayCan
	} from '@lucide/svelte';
	import type { CategoryId } from '$lib/categories';

	let { category, size = 16 }: { category: CategoryId; size?: number } = $props();

	const icons = {
		'obst-gemuese': Apple,
		brot: Croissant,
		kuehlregal: Milk,
		'fleisch-fisch': Beef,
		vorrat: Package,
		suesses: Candy,
		getraenke: CupSoda,
		tiefkuehl: Snowflake,
		drogerie: Droplets,
		haushalt: SprayCan,
		'baby-tier': Baby,
		sonstiges: ShoppingBasket
	};
	let Icon = $derived(icons[category]);
</script>

<Icon {size} aria-hidden="true" />
