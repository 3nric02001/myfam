<script lang="ts">
	import { HouseHeart } from '@lucide/svelte';
	let { children } = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
	<div class="mb-8 text-center">
		<span
			class="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm"
			aria-hidden="true"><HouseHeart size={34} strokeWidth={1.75} /></span
		>
		<h1 class="mt-3 text-2xl font-semibold tracking-tight text-slate-900">MyFam</h1>
		<p class="text-sm text-slate-500">Termine, Einkäufe und Planung für die ganze Familie</p>
	</div>
	{@render children()}
</main>
