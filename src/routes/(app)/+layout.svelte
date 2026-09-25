<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	const tabs = [
		{ href: '/einkauf', label: 'Einkauf', icon: '🛒' },
		{ href: '/kalender', label: 'Kalender', icon: '📅' },
		{ href: '/planung', label: 'Planung', icon: '✅' },
		{ href: '/familie', label: 'Familie', icon: '👪' }
	];

	// Pick up changes made by other family members when the app comes back into view.
	onMount(() => {
		const refresh = () => document.visibilityState === 'visible' && invalidateAll();
		document.addEventListener('visibilitychange', refresh);
		const timer = setInterval(refresh, 30_000);
		return () => {
			document.removeEventListener('visibilitychange', refresh);
			clearInterval(timer);
		};
	});
</script>

<div class="mx-auto flex min-h-dvh max-w-md flex-col">
	<header
		class="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur"
	>
		<div class="flex-1">
			<p class="text-xs text-slate-500">Hallo {data.user.name}</p>
			<p class="font-semibold text-slate-900">{data.family?.name ?? 'MyFam'}</p>
		</div>
		<a
			href="/einstellungen"
			class="-mr-2 flex size-11 items-center justify-center rounded-full text-xl {page.url.pathname.startsWith(
				'/einstellungen'
			)
				? 'bg-emerald-50'
				: ''}"
			aria-label="Einstellungen"
			title="Einstellungen"><span aria-hidden="true">⚙️</span></a
		>
	</header>

	<main class="flex-1 px-4 pt-4 pb-28">
		{@render children()}
	</main>

	<nav
		class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
	>
		<ul class="mx-auto grid max-w-md grid-cols-4">
			{#each tabs as tab (tab.href)}
				{@const active = page.url.pathname.startsWith(tab.href)}
				<li>
					<a
						href={tab.href}
						class="flex flex-col items-center gap-0.5 py-2 text-xs {active
							? 'font-semibold text-emerald-700'
							: 'text-slate-500'}"
						aria-current={active ? 'page' : undefined}
					>
						<span class="text-xl" aria-hidden="true">{tab.icon}</span>
						{tab.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>
