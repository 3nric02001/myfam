<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { openNotificationPages } from '$lib/push-client';
	import { onMount } from 'svelte';
	import {
		CalendarDays,
		HouseHeart,
		LayoutDashboard,
		ListTodo,
		Settings,
		ShoppingCart,
		UsersRound
	} from '@lucide/svelte';
	import PushPrompt from '$lib/components/PushPrompt.svelte';

	let { data, children } = $props();

	const tabs = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/einkauf', label: 'Einkauf', icon: ShoppingCart },
		{ href: '/kalender', label: 'Kalender', icon: CalendarDays },
		{ href: '/planung', label: 'Planung', icon: ListTodo },
		{ href: '/familie', label: 'Familie', icon: UsersRound }
	];

	// A tapped push notification opens the page it is about (event, task, comment).
	onMount(() => openNotificationPages((url) => goto(url, { invalidateAll: true })));

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
		class="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200/70 bg-surface/85 px-4 py-3 backdrop-blur"
	>
		<span
			class="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white"
			aria-hidden="true"><HouseHeart size={22} strokeWidth={1.75} /></span
		>
		<div class="flex-1 leading-tight">
			<p class="text-xs text-slate-500">Hallo {data.user.name}</p>
			<p class="font-semibold text-slate-900">{data.family?.name ?? 'MyFam'}</p>
		</div>
		<a
			href="/einstellungen"
			class="-mr-2 flex size-11 items-center justify-center rounded-full {page.url.pathname.startsWith(
				'/einstellungen'
			)
				? 'bg-brand-50 text-brand-700'
				: 'text-slate-500'}"
			aria-label="Einstellungen"
			title="Einstellungen"><Settings size={22} strokeWidth={1.75} aria-hidden="true" /></a
		>
	</header>

	<main class="flex-1 px-4 pt-4 pb-28">
		{#if !page.url.pathname.startsWith('/einstellungen')}
			<PushPrompt publicKey={data.pushKey} />
		{/if}
		{@render children()}
	</main>

	<nav
		class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
	>
		<ul class="mx-auto grid max-w-md grid-cols-5">
			{#each tabs as tab (tab.href)}
				{@const active = page.url.pathname.startsWith(tab.href)}
				<li>
					<a
						href={tab.href}
						class="flex flex-col items-center gap-1 pt-2 pb-1.5 text-xs {active
							? 'font-semibold text-brand-700'
							: 'text-slate-500'}"
						aria-current={active ? 'page' : undefined}
					>
						<span
							class="flex h-8 w-12 items-center justify-center rounded-full transition-colors {active
								? 'bg-brand-100'
								: ''}"
							aria-hidden="true"><tab.icon size={22} strokeWidth={active ? 2 : 1.75} /></span
						>
						{tab.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>
