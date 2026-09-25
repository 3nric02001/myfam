<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';
	import { page } from '$app/state';
</script>

<svelte:head><title>Fehler · MyFam</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10 text-center">
	<span
		class="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
		aria-hidden="true"><CircleAlert size={32} strokeWidth={1.75} /></span
	>
	<h1 class="mt-4 text-xl font-bold">
		{page.status === 404 ? 'Seite nicht gefunden' : 'Da ist etwas schiefgelaufen'}
	</h1>
	<p class="mt-2 text-slate-600">{page.error?.message}</p>
	<a class="btn-primary mt-6" href="/">Zur Startseite</a>
</main>
