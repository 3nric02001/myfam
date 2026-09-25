<script lang="ts">
	let { children } = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
	<div class="mb-8 text-center">
		<div class="text-4xl" aria-hidden="true">🏠</div>
		<h1 class="mt-2 text-2xl font-bold text-slate-900">MyFam</h1>
		<p class="text-sm text-slate-500">Termine, Einkäufe und Planung für die ganze Familie</p>
	</div>
	{@render children()}
</main>
