<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Einladung · MyFam</title></svelte:head>

<div class="card space-y-4">
	<h2 class="text-lg font-semibold">Einladung zu „{data.familyName}“</h2>
	{#if form?.message}<p class="error">{form.message}</p>{/if}

	{#if data.user}
		<p class="text-sm text-slate-600">
			Du bist als {data.user.name} angemeldet. Möchtest du der Familie beitreten?
		</p>
		<form method="POST" action="?/join" use:enhance>
			<button class="btn-primary w-full">Beitreten</button>
		</form>
	{:else}
		<p class="text-sm text-slate-600">Lege ein Konto an, um der Familie beizutreten.</p>
		<form method="POST" action="?/register" use:enhance class="space-y-4">
			<label class="block">
				<span class="label">Dein Name</span>
				<input
					name="name"
					autocomplete="given-name"
					required
					maxlength="60"
					value={form?.name ?? ''}
				/>
			</label>
			<label class="block">
				<span class="label">E-Mail</span>
				<input name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
			</label>
			<label class="block">
				<span class="label">Passwort (mind. 10 Zeichen)</span>
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					required
					minlength="10"
				/>
			</label>
			<button class="btn-primary w-full">Konto anlegen und beitreten</button>
		</form>
		<p class="text-center text-sm text-slate-600">
			Schon ein Konto?
			<a class="link" href="/login?next={encodeURIComponent(page.url.pathname)}">Anmelden</a>
		</p>
	{/if}
</div>
