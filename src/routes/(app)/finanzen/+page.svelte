<script lang="ts">
	import { ChevronRight, ReceiptText } from '@lucide/svelte';
	import { monthLabel, shortDayLabel } from '$lib/dates';
	import { formatPrice, storeLabel } from '$lib/offers';
	import {
		averageSpending,
		CHART_PERIODS,
		groupByMonth,
		spendingBy,
		type Period
	} from '$lib/purchases';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let period = $state<Period>('week');
	let buckets = $derived(spendingBy(period, data.chart, data.today, CHART_PERIODS[period]));
	let average = $derived(averageSpending(buckets));
	let selectedKey = $state<string | null>(null);
	let selected = $derived(buckets.find((b) => b.key === selectedKey) ?? buckets.at(-1)!);
	let max = $derived(Math.max(1, average ?? 0, ...buckets.map((b) => b.total)));
	let groups = $derived(groupByMonth(data.purchases));

	function setPeriod(p: Period) {
		period = p;
		selectedKey = null;
	}

	/** Whole euros on the bars; the exact sum is shown above the chart. */
	function euros(cents: number) {
		return `${Math.round(cents / 100)} €`;
	}

	function selectedTitle() {
		const current = selected === buckets.at(-1);
		if (period === 'week') return current ? 'Diese Woche' : `Woche ab ${selected.label}`;
		return current ? 'Dieser Monat' : monthLabel(selected.key);
	}
</script>

<svelte:head><title>Finanzen · MyFam</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">Finanzen</h1>
<p class="mb-4 text-sm text-slate-500">Eure Einkäufe aus den fotografierten Kassenzetteln.</p>

{#if !data.purchases.length}
	<div class="card p-5 text-center">
		<ReceiptText size={32} class="mx-auto mb-2 text-slate-400" aria-hidden="true" />
		<p class="mb-1 font-semibold">Noch keine Einkäufe</p>
		<p class="mb-4 text-sm text-slate-500">
			Jeder Kassenzettel, den du fotografierst und speicherst, erscheint hier mit allen Artikeln.
		</p>
		<a href="/einkauf/kassenzettel" class="btn-primary">Kassenzettel fotografieren</a>
	</div>
{:else}
	<section class="card mb-5 p-4" aria-label="Ausgaben">
		<div class="mb-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
			{#each [['week', 'Wochen'], ['month', 'Monate']] as const as [value, label] (value)}
				<button
					type="button"
					class="min-h-9 rounded-lg {period === value
						? 'bg-surface text-slate-900 shadow-sm'
						: 'text-slate-500'}"
					aria-pressed={period === value}
					onclick={() => setPeriod(value)}>{label}</button
				>
			{/each}
		</div>

		<div class="mb-4 flex items-end justify-between gap-3">
			<div>
				<p class="text-sm text-slate-500">{selectedTitle()}</p>
				<p class="text-2xl font-bold tabular-nums">{formatPrice(selected.total)}</p>
				<p class="text-xs text-slate-500">
					{selected.trips}
					{selected.trips === 1 ? 'Einkauf' : 'Einkäufe'}
				</p>
			</div>
			{#if average != null}
				<div class="text-right">
					<p class="text-sm text-slate-500">Ø pro {period === 'week' ? 'Woche' : 'Monat'}</p>
					<p class="font-semibold tabular-nums">{formatPrice(average)}</p>
				</div>
			{/if}
		</div>

		<div class="relative flex h-44 items-end gap-1.5">
			{#if average != null}
				<div
					class="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400"
					style="bottom: calc({(average / max) * 100}% * 0.82 + 1.375rem)"
					aria-hidden="true"
				></div>
			{/if}
			{#each buckets as b, i (b.key)}
				{@const active = b.key === selected.key}
				<button
					type="button"
					class="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
					aria-label="{period === 'week' ? `Woche ab ${b.label}` : monthLabel(b.key)}: {formatPrice(
						b.total
					)}"
					aria-current={active ? 'true' : undefined}
					onclick={() => (selectedKey = b.key)}
				>
					<span
						class="relative mb-1 rounded bg-surface px-0.5 text-[11px] leading-none font-semibold tabular-nums {active
							? 'text-slate-900'
							: 'text-slate-500'} {b.total ? '' : 'invisible'}">{euros(b.total)}</span
					>
					<span
						class="w-full max-w-10 rounded-t-md {active
							? 'bg-brand-600'
							: i === buckets.length - 1
								? 'bg-brand-300'
								: 'bg-brand-200'}"
						style="height: calc({(b.total / max) * 100}% * 0.82); min-height: {b.total
							? '4px'
							: '2px'}"
					></span>
					<span
						class="mt-1.5 h-4 text-[11px] leading-4 whitespace-nowrap {active
							? 'font-semibold text-slate-900'
							: 'text-slate-500'}">{b.label}</span
					>
				</button>
			{/each}
		</div>
		{#if average != null}
			<p class="mt-2 text-xs text-slate-500">
				Gestrichelt: Durchschnitt der {period === 'week' ? 'Wochen' : 'Monate'} mit Einkauf.
			</p>
		{/if}
	</section>

	{#each groups as group (group.month)}
		<section class="mb-5">
			<h2 class="section-title">
				<span>{monthLabel(group.month)}</span>
				<span class="text-sm text-slate-500 tabular-nums"
					>{formatPrice(group.items.reduce((s, p) => s + p.total, 0))}</span
				>
			</h2>
			<ul class="card divide-y divide-slate-100">
				{#each group.items as p (p.id)}
					<li>
						<a href="/finanzen/{p.id}" class="flex min-h-14 items-center gap-3 px-4 py-2.5">
							<div class="min-w-0 flex-1">
								<p class="truncate font-semibold">{storeLabel(p.store)}</p>
								<p class="text-xs text-slate-500">
									{shortDayLabel(p.date)} · {p.lines} Artikel{p.createdBy
										? ` · ${p.createdBy}`
										: ''}
								</p>
							</div>
							<span class="font-semibold tabular-nums">{formatPrice(p.total)}</span>
							<ChevronRight size={18} class="shrink-0 text-slate-400" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}
