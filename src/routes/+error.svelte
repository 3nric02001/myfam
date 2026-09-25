<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>Fehler · MyFam</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10 text-center">
	<p class="text-4xl" aria-hidden="true">😕</p>
	<h1 class="mt-2 text-xl font-bold">
		{page.status === 404 ? 'Seite nicht gefunden' : 'Da ist etwas schiefgelaufen'}
	</h1>
	<p class="mt-2 text-slate-600">{page.error?.message}</p>
	<a class="btn-primary mt-6" href="/">Zur Startseite</a>
</main>
