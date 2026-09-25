<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Familie anlegen · MyFam</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">Familie anlegen</h1>
{#if !data.family}
	<p class="mb-4 text-sm text-slate-600">
		Du gehörst gerade zu keiner Familie. Lege eine neue an oder lass dir einen Einladungslink
		schicken.
	</p>
{/if}
<form method="POST" use:enhance class="card space-y-4 p-4">
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	<label class="block">
		<span class="label">Familienname</span>
		<input name="familyName" required maxlength="60" placeholder="z. B. Familie Müller" />
	</label>
	<button class="btn-primary w-full">Anlegen</button>
</form>
