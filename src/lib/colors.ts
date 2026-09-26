// One colour per family member, so calendar, tasks and the shopping list show at a glance who
// something belongs to. The tones are mid-dark so they read on light and dark backgrounds.

export const COLORS = [
	{ id: 'salbei', label: 'Salbei', hex: '#2f8873' },
	{ id: 'blau', label: 'Blau', hex: '#3d6fb4' },
	{ id: 'koralle', label: 'Koralle', hex: '#d0654a' },
	{ id: 'senf', label: 'Senf', hex: '#c0912a' },
	{ id: 'lila', label: 'Lila', hex: '#8a5cb8' },
	{ id: 'rosa', label: 'Rosa', hex: '#c7568a' },
	{ id: 'petrol', label: 'Petrol', hex: '#2a8aa0' },
	{ id: 'oliv', label: 'Oliv', hex: '#7d8b35' }
] as const;

export type ColorId = (typeof COLORS)[number]['id'];

export function isColor(value: unknown): value is ColorId {
	return COLORS.some((c) => c.id === value);
}

export function colorHex(id: string | null | undefined) {
	return COLORS.find((c) => c.id === id)?.hex ?? null;
}

/** Chosen colours win; everyone else gets the next unused one in join order. */
export function assignColors<T extends { id: string; color: string | null }>(members: T[]) {
	const taken = new Set(members.map((m) => m.color).filter(isColor));
	const free = COLORS.map((c) => c.id).filter((id) => !taken.has(id));
	let next = 0;
	return members.map((m, i) => ({
		...m,
		color: isColor(m.color) ? m.color : (free[next++] ?? COLORS[i % COLORS.length].id)
	}));
}
