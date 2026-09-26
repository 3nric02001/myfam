<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { openNotificationPages } from '$lib/push-client';
	import { onMount } from 'svelte';
	import {
		CalendarDays,
		CalendarHeart,
		ChevronDown,
		CloudOff,
		HouseHeart,
		LayoutDashboard,
		ListTodo,
		Settings,
		ShoppingCart,
		Users,
		UtensilsCrossed,
		Wallet,
		X
	} from '@lucide/svelte';
	import PushPrompt from '$lib/components/PushPrompt.svelte';

	let { data, children } = $props();

	// The family settings moved into Einstellungen; the meal plan is used daily, so it gets a tab.
	const tabs = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/einkauf', label: 'Einkauf', icon: ShoppingCart },
		{ href: '/kalender', label: 'Kalender', icon: CalendarDays },
		{ href: '/kalender/essen', label: 'Essen', icon: UtensilsCrossed },
		{ href: '/planung', label: 'Planung', icon: ListTodo }
	];
	// The menu behind the logo lists every page; the tab bar stays as the shortcut for daily ones.
	const menuPages = [
		...tabs,
		{ href: '/woche', label: 'Wochenplanung', icon: CalendarHeart },
		{ href: '/finanzen', label: 'Finanzen', icon: Wallet }
	];
	const menuFamily = [
		{ href: '/familie', label: 'Familie', icon: Users },
		{ href: '/einstellungen', label: 'Einstellungen', icon: Settings }
	];
	let menu = $state<HTMLDialogElement>();
	afterNavigate(() => menu?.close());

	const isActive = (href: string, path: string) =>
		href === '/kalender'
			? path.startsWith('/kalender') && !path.startsWith('/kalender/essen')
			: path.startsWith(href);
	let settingsActive = $derived(
		page.url.pathname.startsWith('/einstellungen') || page.url.pathname.startsWith('/familie')
	);

	// Without a connection the pages come from the phone's cache (see service-worker.ts).
	let offline = $state(false);

	// A tapped push notification opens the page it is about (event, task, comment).
	onMount(() => openNotificationPages((url) => goto(url, { invalidateAll: true })));

	// Pick up changes made by other family members when the app comes back into view.
	onMount(() => {
		const updateOnline = () => (offline = !navigator.onLine);
		updateOnline();
		window.addEventListener('online', updateOnline);
		window.addEventListener('offline', updateOnline);
		const refresh = () =>
			document.visibilityState === 'visible' && navigator.onLine && invalidateAll();
		document.addEventListener('visibilitychange', refresh);
		const timer = setInterval(refresh, 30_000);
		return () => {
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('online', updateOnline);
			window.removeEventListener('offline', updateOnline);
			clearInterval(timer);
		};
	});
</script>

<div class="mx-auto flex min-h-dvh max-w-md flex-col">
	<header
		class="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200/70 bg-surface/85 px-4 py-1.5 backdrop-blur"
	>
		<button
			type="button"
			class="-ml-1.5 flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 text-left active:bg-slate-100"
			aria-haspopup="dialog"
			aria-label="Menü öffnen"
			onclick={() => menu?.showModal()}
		>
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"
				aria-hidden="true"><HouseHeart size={16} strokeWidth={1.75} /></span
			>
			<span class="min-w-0 truncate text-sm font-semibold text-slate-900">
				{data.family?.name ?? 'MyFam'}
			</span>
			<ChevronDown size={16} class="shrink-0 text-slate-400" aria-hidden="true" />
		</button>
		<a
			href="/einstellungen"
			class="-mr-2 flex size-10 items-center justify-center rounded-full {settingsActive
				? 'bg-brand-50 text-brand-700'
				: 'text-slate-500'}"
			aria-label="Einstellungen"
			title="Einstellungen"><Settings size={20} strokeWidth={1.75} aria-hidden="true" /></a
		>
	</header>
	<dialog
		bind:this={menu}
		class="menu m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface p-0 text-slate-900 shadow-xl"
		aria-label="Menü"
		onclick={(e) => e.target === menu && menu?.close()}
	>
		<div class="flex min-h-full flex-col px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
			<div class="mb-3 flex items-center gap-2 px-2">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"
					aria-hidden="true"><HouseHeart size={16} strokeWidth={1.75} /></span
				>
				<p class="min-w-0 flex-1 truncate font-semibold">{data.family?.name ?? 'MyFam'}</p>
				<button
					type="button"
					class="icon-btn -mr-2"
					aria-label="Menü schließen"
					onclick={() => menu?.close()}><X size={20} aria-hidden="true" /></button
				>
			</div>
			{#snippet entry(item: (typeof menuPages)[number], active: boolean)}
				<li>
					<a
						href={item.href}
						class="flex min-h-11 items-center gap-3 rounded-xl px-3 {active
							? 'bg-brand-50 font-semibold text-brand-700'
							: 'text-slate-700 active:bg-slate-100'}"
						aria-current={active ? 'page' : undefined}
						><item.icon size={20} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
						{item.label}</a
					>
				</li>
			{/snippet}
			<ul class="space-y-0.5">
				{#each menuPages as item (item.href)}
					{@render entry(item, isActive(item.href, page.url.pathname))}
				{/each}
			</ul>
			<hr class="my-3 border-slate-200" />
			<ul class="space-y-0.5">
				{#each menuFamily as item (item.href)}
					{@render entry(item, page.url.pathname.startsWith(item.href))}
				{/each}
			</ul>
		</div>
	</dialog>

	{#if offline}
		<p
			class="flex items-center justify-center gap-2 bg-accent-50 px-4 py-1.5 text-xs font-medium text-accent-700"
			role="status"
		>
			<CloudOff size={14} aria-hidden="true" /> Offline: du siehst den letzten Stand
		</p>
	{/if}

	<main class="flex-1 px-4 pt-4 pb-28">
		{#if page.url.pathname.startsWith('/dashboard')}
			<PushPrompt publicKey={data.pushKey} />
		{/if}
		{@render children()}
	</main>

	<nav
		class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
	>
		<ul class="mx-auto grid max-w-md grid-cols-5">
			{#each tabs as tab (tab.href)}
				{@const active = isActive(tab.href, page.url.pathname)}
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
