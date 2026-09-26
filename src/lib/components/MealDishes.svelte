<script lang="ts">
	import type { Dish } from '$lib/meals';

	// Earlier dishes for the name field of MealDay; picking one fills in its ingredients.
	let { id, dishes }: { id: string; dishes: Dish[] } = $props();
</script>

<datalist {id}>
	{#each dishes as dish (dish.name)}
		<option value={dish.name} data-ingredients={dish.ingredients ?? ''}></option>
	{/each}
</datalist>
