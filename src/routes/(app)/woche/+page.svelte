<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		ArrowLeft,
		ArrowRight,
		CalendarDays,
		CalendarHeart,
		CalendarSync,
		Check,
		ChefHat,
		Lightbulb,
		ListTodo,
		PartyPopper,
		Plus,
		ShoppingCart,
		SkipForward,
		Sparkles,
		Trash2,
		UtensilsCrossed,
		X
	} from '@lucide/svelte';
	import { dayLabel, shortDate, shortDayLabel } from '$lib/dates';
	import { mealSlotLabel, mealSlots } from '$lib/meals';
	import {
		mealQuestion,
		suggestDishes,
		WEEKDAY_NAMES,
		weekSteps,
		weekdayOf,
		type WeekStep
	} from '$lib/week';
	import type { MealSlot } from '$lib/server/db/schema';
	import PersonDot from '$lib/components/PersonDot.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const stepInfo: Record<
		WeekStep,
		{ title: string; question: string; hint: string; icon: typeof ListTodo }
	> = {
		termine: {
			title: 'Termine',
			question: 'Was steht nächste Woche an?',
			hint: 'Arzt, Training, Elternabend: was noch fehlt, ist schnell eingetragen.',
			icon: CalendarDays
		},
		aufgaben: {
			title: 'Aufgaben',
			question: 'Was muss erledigt werden?',
			hint: 'Wer kümmert sich um was? Offenes von vorher kannst du gleich abhaken.',
			icon: ListTodo
		},
		essen: {
			title: 'Essen',
			question: 'Was gibt es zu essen?',
			hint: 'Vorschläge kommen aus dem, was ihr früher gekocht habt.',
			icon: UtensilsCrossed
		},
		einkauf: {
			title: 'Einkauf',
			question: 'Was brauchen wir dafür?',
			hint: 'Zutaten auf die Liste setzen und einen Einkaufstag festlegen.',
			icon: ShoppingCart
		}
	};

	let index = $derived(data.step && data.step !== 'fertig' ? weekSteps.indexOf(data.step) : -1);
	const href = (step: WeekStep | 'fertig' | null) =>
		step ? `?woche=${data.week}&schritt=${step}` : `?woche=${data.week}`;
	let prev = $derived(index > 0 ? weekSteps[index - 1] : null);
	let next = $derived(index >= 0 && index < weekSteps.length - 1 ? weekSteps[index + 1] : null);
	let message = $derived(
		form && 'message' in form && form.step === data.step ? (form.message as string) : null
	);
	let ideaSaved = $derived(
		form && 'idea' in form && form.step === data.step ? (form.idea as string) : null
	);
	let ideaName = $state('');
	let added = $derived(
		form && 'added' in form && form.step === data.step ? (form.added as string) : null
	);

	let range = $derived(`${shortDayLabel(data.days[0])} – ${shortDayLabel(data.days[6])}`);
	let holidayOf = $derived(new Map(data.holidays.map((h) => [h.date, h.name])));
	const weekdayShort = (date: string) => WEEKDAY_NAMES[weekdayOf(date)].slice(0, 2);

	// --- Essen -------------------------------------------------------------------------------

	/** The meals the family plans on that day. */
	const slotsOf = (date: string) => data.slots[weekdayOf(date)];
	let allSlots = $derived(mealSlots.filter((slot) => data.slots.some((day) => day.includes(slot))));
	let total = $derived(data.days.reduce((sum, date) => sum + slotsOf(date).length, 0));
	let mealAt = $derived(new Map(data.meals.map((m) => [`${m.date}:${m.slot}`, m])));
	let openSlots = $derived(
		data.days.flatMap((date) =>
			slotsOf(date)
				.filter((slot) => !mealAt.has(`${date}:${slot}`))
				.map((slot) => ({ date, slot }))
		)
	);
	let plannedCount = $derived(total - openSlots.length);

	/** The meal the interview is asking about. */
	let active = $state<{ date: string; slot: MealSlot } | null>(null);
	let current = $derived(
		active ?? openSlots[0] ?? { date: data.days[0], slot: slotsOf(data.days[0])[0] ?? allSlots[0] }
	);
	let currentMeal = $derived(mealAt.get(`${current.date}:${current.slot}`));
	let suggestions = $derived(
		suggestDishes(data.dishes, current.date, current.slot, {
			planned: data.meals.map((m) => m.name)
		})
	);
	let ownName = $state('');
	let ownIngredients = $state('');
	let changing = $state(false);

	/** The next open meal after the current one, wrapping around the week. */
	function advance() {
		const order = data.days.flatMap((date) => slotsOf(date).map((slot) => ({ date, slot })));
		const at = order.findIndex((o) => o.date === current.date && o.slot === current.slot);
		const rest = [...order.slice(at + 1), ...order.slice(0, at)];
		active = rest.find((o) => !mealAt.has(`${o.date}:${o.slot}`)) ?? null;
		ownName = '';
		ownIngredients = '';
		changing = false;
	}

	function pick(date: string) {
		const slot =
			slotsOf(date).find((s) => !mealAt.has(`${date}:${s}`)) ?? slotsOf(date)[0] ?? allSlots[0];
		active = { date, slot };
		changing = false;
	}

	// Picking an earlier dish in the free field fills in what it needed last time.
	function fillIngredients() {
		if (ownIngredients.trim()) return;
		const dish = data.dishes.find((d) => d.name.toLowerCase() === ownName.trim().toLowerCase());
		if (dish?.ingredients) ownIngredients = dish.ingredients;
	}

	const saveAndAdvance = () => {
		return async ({
			update,
			result
		}: {
			update: (o?: { reset?: boolean }) => Promise<void>;
			result: { type: string };
		}) => {
			await update({ reset: false });
			if (result.type === 'success') advance();
		};
	};

	// --- Einkauf -----------------------------------------------------------------------------

	let pending = $derived(data.meals.filter((m) => m.ingredients && !m.addedToList));
	let withIngredients = $derived(data.meals.filter((m) => m.ingredients));
	let tripDays = $derived(
		[...new Set([data.today, ...data.days])].filter((d) => d >= data.today).slice(0, 8)
	);
</script>

<svelte:head><title>Wochenplanung · MyFam</title></svelte:head>

{#snippet dayChips(name: string, selected: string)}
	<fieldset>
		<legend class="label">Tag</legend>
		<div class="grid grid-cols-7 gap-1">
			{#each data.days as date (date)}
				<label class="block">
					<input
						type="radio"
						{name}
						value={date}
						checked={date === selected}
						class="peer sr-only"
					/>
					<span
						class="flex h-14 cursor-pointer flex-col items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-700 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600"
					>
						<span class="text-xs font-semibold">{weekdayShort(date)}</span>
						<span class="text-sm tabular-nums">{Number(date.slice(8))}.</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>
{/snippet}

{#snippet footer()}
	<div class="mt-6 flex gap-2">
		<a href={href(prev)} class="btn-secondary w-14 px-0" aria-label="Zurück"
			><ArrowLeft size={20} aria-hidden="true" /></a
		>
		{#if next}
			<a href={href(next)} class="btn-primary flex-1"
				>Weiter: {stepInfo[next].title} <ArrowRight size={18} aria-hidden="true" /></a
			>
		{:else}
			<form method="POST" action="?/done" use:enhance class="flex flex-1">
				<input type="hidden" name="week" value={data.week} />
				<button class="btn-primary flex-1"
					><Check size={18} aria-hidden="true" /> Woche abschließen</button
				>
			</form>
		{/if}
	</div>
{/snippet}

<!-- Top bar: close, and the progress through the four questions. -->
<div class="mb-5 flex items-center gap-3">
	<a href="/dashboard" class="icon-btn -ml-2 text-slate-500" aria-label="Wochenplanung schließen"
		><X size={22} aria-hidden="true" /></a
	>
	<ol class="flex flex-1 gap-1.5" aria-label="Fortschritt">
		{#each weekSteps as step, i (step)}
			<li class="flex-1">
				<a
					href={href(step)}
					class="block h-1.5 rounded-full {data.step === 'fertig' || i <= index
						? 'bg-brand-600'
						: 'bg-slate-300'}"
					aria-label="{stepInfo[step].title}{i === index ? ' (aktuell)' : ''}"
					aria-current={i === index ? 'step' : undefined}
				></a>
			</li>
		{/each}
	</ol>
	<span class="w-10 text-right text-xs font-semibold text-slate-500 tabular-nums"
		>{index >= 0 ? `${index + 1}/4` : ''}</span
	>
</div>

{#if data.step === null}
	<!-- Intro -->
	<section
		class="relative overflow-hidden rounded-3xl bg-brand-600 p-6 text-white shadow-sm"
		aria-labelledby="woche-titel"
	>
		<div
			class="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10"
			aria-hidden="true"
		></div>
		<div
			class="pointer-events-none absolute -right-4 -bottom-16 size-32 rounded-full bg-white/5"
			aria-hidden="true"
		></div>
		<span
			class="flex size-11 items-center justify-center rounded-2xl bg-white/15"
			aria-hidden="true"><CalendarHeart size={24} /></span
		>
		<p class="mt-4 text-sm font-semibold text-white/80">Wochenplanung</p>
		<h1 id="woche-titel" class="text-2xl leading-tight font-bold">{range}</h1>
		<p class="mt-2 text-white/85">Vier kurze Fragen, dann steht die Woche für die ganze Familie.</p>
		{#if data.done}
			<p class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm">
				<Check size={15} aria-hidden="true" />
				Abgeschlossen{data.done.by ? ` von ${data.done.by}` : ''}
			</p>
		{/if}
	</section>

	<ol class="card mt-5 px-2 py-1">
		{#each weekSteps as step, i (step)}
			{@const info = stepInfo[step]}
			{@const status =
				step === 'termine'
					? data.events.length
						? `${data.events.length} eingetragen`
						: 'Noch nichts eingetragen'
					: step === 'aufgaben'
						? `${data.tasks.filter((t) => !t.done).length} geplant${data.overdue.length ? `, ${data.overdue.length} noch offen` : ''}`
						: step === 'essen'
							? `${plannedCount} von ${total} Mahlzeiten`
							: data.shopping.plan
								? `Einkauf ${shortDayLabel(data.shopping.plan)}`
								: 'Noch kein Einkaufstag'}
			<li class="border-b border-slate-100 last:border-0">
				<a href={href(step)} class="flex min-h-16 items-center gap-3 px-1">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
						aria-hidden="true"><info.icon size={20} /></span
					>
					<span class="min-w-0 flex-1">
						<span class="block font-semibold">{i + 1}. {info.title}</span>
						<span class="block text-sm text-slate-500">{status}</span>
					</span>
					<ArrowRight size={18} class="text-slate-400" aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ol>

	<a href={href('termine')} class="btn-primary mt-6 w-full"
		>Los geht's <ArrowRight size={18} aria-hidden="true" /></a
	>
{:else if data.step === 'fertig'}
	<section class="card p-6 text-center">
		<span
			class="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-600 text-white"
			aria-hidden="true"><PartyPopper size={30} /></span
		>
		<h1 class="mt-4 text-2xl font-bold">Die Woche steht!</h1>
		<p class="mt-1 text-slate-500">{range}</p>
		<dl class="mt-5 grid grid-cols-2 gap-2 text-left">
			<div class="rounded-2xl bg-slate-50 p-3">
				<dt class="text-sm text-slate-500">Termine</dt>
				<dd class="text-2xl font-bold tabular-nums">{data.events.length}</dd>
			</div>
			<div class="rounded-2xl bg-slate-50 p-3">
				<dt class="text-sm text-slate-500">Aufgaben</dt>
				<dd class="text-2xl font-bold tabular-nums">{data.tasks.filter((t) => !t.done).length}</dd>
			</div>
			<div class="rounded-2xl bg-slate-50 p-3">
				<dt class="text-sm text-slate-500">Mahlzeiten</dt>
				<dd class="text-2xl font-bold tabular-nums">
					{plannedCount}<span class="text-base font-medium text-slate-500">/{total}</span>
				</dd>
			</div>
			<div class="rounded-2xl bg-slate-50 p-3">
				<dt class="text-sm text-slate-500">Einkauf</dt>
				<dd class="text-lg leading-8 font-bold">
					{data.shopping.plan ? shortDayLabel(data.shopping.plan) : '–'}
				</dd>
			</div>
		</dl>
		<p class="mt-4 text-sm text-slate-500">
			Alle in der Familie sehen den Plan. Die Essens-Erinnerung am Sonntagabend fällt für diese
			Woche aus.
		</p>
	</section>
	<div class="mt-5 grid grid-cols-2 gap-2">
		<a href="/kalender?tag={data.week}" class="btn-secondary">Zum Kalender</a>
		<a href="/dashboard" class="btn-primary">Fertig</a>
	</div>
{:else}
	{@const info = stepInfo[data.step]}
	<header class="mb-5">
		<p class="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
			<info.icon size={16} aria-hidden="true" /> Frage {index + 1} von 4 · {info.title}
		</p>
		<h1 class="mt-1 text-2xl leading-tight font-bold">{info.question}</h1>
		<p class="mt-1 text-sm text-slate-500">{info.hint}</p>
	</header>

	{#if message}<p class="error mb-3">{message}</p>{/if}
	{#if added}<p class="success mb-3">„{added}“ ist eingetragen.</p>{/if}

	{#if data.step === 'termine'}
		<h2 class="section-title">Eure Woche · {range}</h2>
		<ul class="card px-3 py-1">
			{#each data.days as date (date)}
				{@const events = data.events.filter((e) => e.startDate <= date && e.endDate >= date)}
				<li class="flex gap-3 border-b border-slate-100 py-2 last:border-0">
					<span class="w-10 shrink-0 pt-0.5 text-center leading-tight">
						<span class="block text-xs font-semibold text-slate-500">{weekdayShort(date)}</span>
						<span class="block font-bold tabular-nums">{Number(date.slice(8))}</span>
					</span>
					<div class="min-w-0 flex-1 self-center">
						{#if holidayOf.get(date)}
							<p class="text-sm font-medium text-accent-600">{holidayOf.get(date)}</p>
						{/if}
						{#each events as event (event.key)}
							<a href={event.href} class="flex min-h-8 items-center gap-2 text-base">
								<span class="w-11 shrink-0 text-sm text-slate-500 tabular-nums"
									>{event.startTime && event.startDate === date ? event.startTime : ''}</span
								>
								{#if event.source}
									<CalendarSync size={14} class="shrink-0 text-slate-400" aria-label="Abo" />
								{:else}
									<PersonDot id={event.personId} />
								{/if}
								<span class="truncate">{event.title}</span>
							</a>
						{:else}
							{#if !holidayOf.get(date)}<p class="text-sm text-slate-500">frei</p>{/if}
						{/each}
					</div>
				</li>
			{/each}
		</ul>

		<h2 class="section-title mt-5">Termin eintragen</h2>
		<form method="POST" action="?/event" use:enhance class="card space-y-3 p-4">
			<label class="block">
				<span class="label">Was?</span>
				<input name="title" required maxlength="100" placeholder="z. B. Elternabend" />
			</label>
			{@render dayChips('date', data.days[0])}
			<div class="flex items-end gap-2">
				<label class="block flex-1">
					<span class="label"
						>Uhrzeit <span class="font-normal text-slate-500">(optional)</span></span
					>
					<input type="time" name="time" />
				</label>
				<button class="btn-primary"><Plus size={18} aria-hidden="true" /> Eintragen</button>
			</div>
		</form>
		<p class="mt-2 px-1 text-sm text-slate-500">
			Neue Termine sieht die ganze Familie. Für Erinnerungen oder Wiederholungen den Termin danach
			im Kalender öffnen.
		</p>
	{:else if data.step === 'aufgaben'}
		{#if data.overdue.length}
			<h2 class="section-title">Noch offen von vorher</h2>
			<ul class="card mb-5 px-2 py-1">
				{#each data.overdue as task (task.id)}
					<TaskRow {task} today={data.today} />
				{/each}
			</ul>
		{/if}

		<h2 class="section-title">Diese Woche fällig</h2>
		<div class="card px-2 py-1">
			{#if data.tasks.length}
				<ul>
					{#each data.tasks as task (task.id)}
						<TaskRow {task} today={data.today} showDue />
					{/each}
				</ul>
			{:else}
				<p class="px-1 py-2 text-sm text-slate-500">Noch keine Aufgaben für diese Woche.</p>
			{/if}
		</div>

		<h2 class="section-title mt-5">Aufgabe verteilen</h2>
		<form method="POST" action="?/task" use:enhance class="card space-y-3 p-4">
			<label class="block">
				<span class="label">Was ist zu tun?</span>
				<input name="title" required maxlength="100" placeholder="z. B. Müll rausbringen" />
			</label>
			{@render dayChips('date', data.days[0])}
			<fieldset>
				<legend class="label">Wer?</legend>
				<div class="flex flex-wrap gap-2">
					<label>
						<input type="radio" name="assigneeId" value="" checked class="peer sr-only" />
						<span
							class="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-slate-200 px-3 text-sm peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:font-semibold peer-checked:text-brand-800"
							>Egal wer</span
						>
					</label>
					{#each data.members as member (member.id)}
						<label>
							<input type="radio" name="assigneeId" value={member.id} class="peer sr-only" />
							<span
								class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-3 text-sm peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:font-semibold peer-checked:text-brand-800"
								><PersonDot id={member.id} />{member.name}</span
							>
						</label>
					{/each}
				</div>
			</fieldset>
			<button class="btn-primary w-full"
				><Plus size={18} aria-hidden="true" /> Aufgabe anlegen</button
			>
		</form>
	{:else if data.step === 'essen'}
		<!-- The week at a glance: one pill per day, a dot per meal. -->
		<div class="grid grid-cols-7 gap-1" role="group" aria-label="Tag wählen">
			{#each data.days as date (date)}
				{@const selected = date === current.date}
				<button
					type="button"
					class="flex h-16 flex-col items-center justify-center gap-1 rounded-xl {selected
						? 'bg-brand-600 text-white'
						: 'bg-surface text-slate-700'}"
					aria-label="{dayLabel(date)}: {slotsOf(date)
						.filter((s) => mealAt.has(`${date}:${s}`))
						.map((s) => mealAt.get(`${date}:${s}`)?.name)
						.join(', ') || 'noch nichts'}"
					aria-pressed={selected}
					onclick={() => pick(date)}
				>
					<span class="text-xs font-semibold">{weekdayShort(date)}</span>
					<span class="flex gap-0.5" aria-hidden="true">
						{#each slotsOf(date) as slot (slot)}
							<span
								class="size-2 rounded-full {mealAt.has(`${date}:${slot}`)
									? selected
										? 'bg-white'
										: 'bg-brand-600'
									: selected
										? 'border border-white/70'
										: 'border border-slate-300'}"
							></span>
						{/each}
					</span>
				</button>
			{/each}
		</div>

		{#if allSlots.length > 1}
			<div class="mt-3 flex gap-1 rounded-xl bg-slate-200/60 p-1" role="tablist">
				{#each allSlots as slot (slot)}
					<button
						type="button"
						role="tab"
						aria-selected={slot === current.slot}
						class="min-h-9 flex-1 rounded-lg text-sm {slot === current.slot
							? 'bg-surface font-semibold shadow-sm'
							: 'text-slate-600'}"
						onclick={() => {
							active = { date: current.date, slot };
							changing = false;
						}}>{mealSlotLabel[slot]}</button
					>
				{/each}
			</div>
		{/if}

		<section class="card mt-3 p-4" aria-live="polite">
			<p class="text-sm font-semibold text-brand-700">{dayLabel(current.date)}</p>
			<h2 class="text-lg leading-snug font-bold">
				Was gibt es am {WEEKDAY_NAMES[weekdayOf(current.date)]}
				{mealQuestion[current.slot]}?
			</h2>

			{#if currentMeal && !changing}
				<div class="mt-3 flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"
						aria-hidden="true"><ChefHat size={20} /></span
					>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-semibold text-brand-900">{currentMeal.name}</span>
						{#if currentMeal.ingredients}
							<span class="block truncate text-sm text-slate-600"
								>{currentMeal.ingredients.split('\n').join(', ')}</span
							>
						{/if}
					</span>
					<form method="POST" action="?/deleteMeal" use:enhance>
						<input type="hidden" name="id" value={currentMeal.id} />
						<button class="icon-btn" aria-label="{currentMeal.name} entfernen"
							><Trash2 size={18} /></button
						>
					</form>
				</div>
				<div class="mt-3 flex gap-2">
					<button type="button" class="btn-secondary flex-1" onclick={() => (changing = true)}
						>Ändern</button
					>
					{#if openSlots.length}
						<button type="button" class="btn-primary flex-1" onclick={advance}
							>Nächste offene <ArrowRight size={18} aria-hidden="true" /></button
						>
					{/if}
				</div>
			{:else}
				{#if suggestions.length}
					<p class="mt-4 mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
						<Sparkles size={15} class="text-accent-600" aria-hidden="true" /> Vorschläge aus eurer Küche
					</p>
					<ul class="space-y-2">
						{#each suggestions as dish (dish.name)}
							<li>
								<form method="POST" action="?/meal" use:enhance={saveAndAdvance}>
									<input type="hidden" name="date" value={current.date} />
									<input type="hidden" name="slot" value={current.slot} />
									<input type="hidden" name="name" value={dish.name} />
									<input type="hidden" name="ingredients" value={dish.ingredients ?? ''} />
									<button
										class="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 px-3 text-left active:bg-brand-50"
									>
										<span class="min-w-0 flex-1">
											<span class="block truncate font-semibold">{dish.name}</span>
											<span class="block truncate text-sm text-slate-500">{dish.reason}</span>
										</span>
										<span
											class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
											aria-hidden="true"><Plus size={18} /></span
										>
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{:else if !data.dishes.length}
					<p class="mt-3 text-sm text-slate-500">
						Sobald ihr ein paar Wochen geplant habt, schlägt MyFam hier Gerichte aus eurer Küche
						vor.
					</p>
				{/if}

				<form
					method="POST"
					action="?/meal"
					use:enhance={saveAndAdvance}
					class="mt-4 space-y-2 border-t border-slate-100 pt-4"
				>
					<input type="hidden" name="date" value={current.date} />
					<input type="hidden" name="slot" value={current.slot} />
					<label class="block">
						<span class="label">{suggestions.length ? 'Oder etwas anderes' : 'Gericht'}</span>
						<input
							name="name"
							required
							maxlength="100"
							autocomplete="off"
							list="woche-gerichte"
							placeholder="Was gibt es?"
							bind:value={ownName}
							onchange={fillIngredients}
						/>
					</label>
					{#if ownName.trim()}
						<label class="block">
							<span class="label"
								>Zutaten <span class="font-normal text-slate-500">(optional)</span></span
							>
							<textarea
								name="ingredients"
								rows="3"
								maxlength="2000"
								class="w-full text-sm"
								placeholder="500 g Nudeln&#10;1 Dose Tomaten"
								bind:value={ownIngredients}></textarea>
						</label>
					{/if}
					<div class="flex gap-2">
						{#if changing}
							<button type="button" class="btn-secondary" onclick={() => (changing = false)}
								>Abbrechen</button
							>
						{:else}
							<button type="button" class="btn-secondary" onclick={advance}
								><SkipForward size={18} aria-hidden="true" /> Auslassen</button
							>
						{/if}
						<button class="btn-primary flex-1" disabled={!ownName.trim()}>Übernehmen</button>
					</div>
				</form>
			{/if}
		</section>
		<datalist id="woche-gerichte">
			{#each data.dishes as dish (dish.name)}<option value={dish.name}></option>{/each}
		</datalist>

		<h2 class="section-title mt-5">
			Der Plan <span class="text-sm font-medium text-slate-500">{plannedCount} von {total}</span>
		</h2>
		<ul class="card px-3 py-1">
			{#each data.days as date (date)}
				<li class="flex gap-3 border-b border-slate-100 py-2 last:border-0">
					<span class="w-8 shrink-0 text-sm font-semibold text-slate-500">{weekdayShort(date)}</span
					>
					<span class="min-w-0 flex-1 space-y-0.5">
						{#each mealSlots.filter((s) => slotsOf(date).includes(s) || mealAt.has(`${date}:${s}`)) as slot (slot)}
							{@const m = mealAt.get(`${date}:${slot}`)}
							<button
								type="button"
								class="flex w-full items-baseline gap-2 text-left"
								onclick={() => {
									active = { date, slot };
									changing = false;
								}}
							>
								{#if allSlots.length > 1}
									<span class="w-12 shrink-0 text-xs text-slate-500">{mealSlotLabel[slot]}</span>
								{/if}
								{#if m}
									<span class="truncate">{m.name}</span>
								{:else}
									<span class="text-sm text-slate-500">offen</span>
								{/if}
							</button>
						{/each}
					</span>
				</li>
			{/each}
		</ul>

		<h2 class="section-title mt-5">
			<span class="flex items-center gap-1.5"
				><Lightbulb size={18} class="text-accent-600" aria-hidden="true" /> Ideenliste</span
			>
		</h2>
		<div class="card p-4">
			<p class="text-sm text-slate-500">
				Gerichte, die ihr mal ausprobieren wollt, ohne sie schon für einen Tag einzuplanen. Sie
				tauchen oben bei den Vorschlägen auf.
			</p>
			{#if data.ideas.length}
				<ul class="mt-3 flex flex-wrap gap-1.5">
					{#each data.ideas as idea (idea.id)}
						<li
							class="flex items-center gap-0.5 rounded-full bg-accent-50 py-0.5 pr-0.5 pl-3 text-sm text-accent-900"
						>
							<span class="max-w-48 truncate">{idea.name}</span>
							<form method="POST" action="?/deleteIdea" use:enhance>
								<input type="hidden" name="id" value={idea.id} />
								<button
									class="flex size-7 items-center justify-center rounded-full text-accent-700 active:bg-accent-100"
									aria-label="{idea.name} von der Ideenliste nehmen"><X size={14} /></button
								>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			{#if ideaSaved}<p class="success mt-3">„{ideaSaved}“ steht auf der Ideenliste.</p>{/if}
			<form
				method="POST"
				action="?/idea"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						ideaName = '';
					}}
				class="mt-3 space-y-2"
			>
				<div class="flex gap-2">
					<input
						name="name"
						required
						maxlength="100"
						autocomplete="off"
						placeholder="z. B. Shakshuka"
						aria-label="Neues Gericht für die Ideenliste"
						bind:value={ideaName}
					/>
					<button class="btn-secondary shrink-0" disabled={!ideaName.trim()}
						><Plus size={18} aria-hidden="true" /> Merken</button
					>
				</div>
				{#if ideaName.trim()}
					<textarea
						name="ingredients"
						rows="2"
						maxlength="2000"
						class="w-full text-sm"
						aria-label="Zutaten (optional)"
						placeholder="Zutaten (optional), eine pro Zeile"></textarea>
				{/if}
			</form>
		</div>
	{:else if data.step === 'einkauf'}
		{#if form && 'listMessage' in form}<p class="success mb-3">{form.listMessage}</p>{/if}
		<h2 class="section-title">Zutaten</h2>
		<div class="card p-4">
			{#if pending.length}
				<p class="text-sm text-slate-500">Für diese Gerichte steht noch nichts auf der Liste:</p>
				<ul class="my-3 flex flex-wrap gap-1.5">
					{#each pending as m (m.id)}
						<li class="rounded-full bg-slate-100 px-3 py-1 text-sm">{m.name}</li>
					{/each}
				</ul>
				<form method="POST" action="?/toList" use:enhance>
					{#each pending as m (m.id)}<input type="hidden" name="id" value={m.id} />{/each}
					<button class="btn-primary w-full"
						><ShoppingCart size={18} aria-hidden="true" /> Zutaten auf die Einkaufsliste</button
					>
				</form>
			{:else if withIngredients.length}
				<p class="flex items-center gap-2 text-sm">
					<Check size={18} class="text-brand-700" aria-hidden="true" /> Alle Zutaten stehen auf der Einkaufsliste.
				</p>
			{:else}
				<p class="text-sm text-slate-500">
					Bei den geplanten Gerichten sind keine Zutaten hinterlegt. Die kannst du im Schritt Essen
					unter „Ändern“ ergänzen.
				</p>
			{/if}
			<a href="/einkauf" class="link mt-3 inline-block text-sm"
				>Einkaufsliste öffnen ({data.shopping.open} offen)</a
			>
		</div>

		<h2 class="section-title mt-5">Wann geht ihr einkaufen?</h2>
		<div class="card p-4">
			{#if data.shopping.plan}
				<p class="mb-3 flex items-center gap-2">
					<Check size={18} class="text-brand-700" aria-hidden="true" />
					<span class="flex-1">Geplant: <strong>{dayLabel(data.shopping.plan)}</strong></span>
				</p>
			{/if}
			<form method="POST" action="?/shop" use:enhance class="grid grid-cols-4 gap-1.5">
				{#each tripDays as date (date)}
					<button
						name="date"
						value={date}
						class="flex h-14 flex-col items-center justify-center rounded-xl border {date ===
						data.shopping.plan
							? 'border-brand-600 bg-brand-600 text-white'
							: 'border-slate-200 text-slate-700 active:bg-slate-100'}"
						aria-pressed={date === data.shopping.plan}
					>
						<span class="text-xs font-semibold"
							>{date === data.today ? 'Heute' : weekdayShort(date)}</span
						>
						<span class="text-sm tabular-nums">{shortDate(date)}</span>
					</button>
				{/each}
			</form>
			{#if data.shopping.plan}
				<form method="POST" action="?/unshop" use:enhance class="mt-2">
					<button class="text-sm text-slate-500 underline">Einkauf absagen</button>
				</form>
			{/if}
			<p class="mt-3 text-sm text-slate-500">
				Der Einkauf landet als Aufgabe für alle im Kalender, mit den Angeboten des Tages.
			</p>
		</div>
	{/if}

	{@render footer()}
{/if}
