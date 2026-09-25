<script lang="ts">
	import '@fontsource-variable/manrope';
	import './layout.css';
	import { browser } from '$app/environment';

	let { data, children } = $props();

	let wrongOrigin = $derived(
		browser && data.expectedOrigin && data.expectedOrigin !== location.origin
			? data.expectedOrigin
			: null
	);
</script>

{#if wrongOrigin}
	<div role="alert" class="sticky top-0 z-50 bg-[#dc2626] px-4 py-3 text-sm text-white">
		<p class="mx-auto max-w-md">
			Die App ist für <strong>{wrongOrigin}</strong> eingerichtet, du rufst sie aber über
			<strong>{location.origin}</strong> auf. So funktionieren Anmelden und Speichern nicht. Setze
			<code>PUBLIC_URL={location.origin}</code> und starte den Container neu.
		</p>
	</div>
{/if}

{@render children()}
