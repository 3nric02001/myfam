import type { Visibility } from '$lib/server/db/schema';

export const visibilityIcon: Record<Visibility, string> = {
	family: '👪',
	shared: '👥',
	private: '🔒'
};

export const visibilityLabel: Record<Visibility, string> = {
	family: 'Ganze Familie',
	shared: 'Bestimmte Personen',
	private: 'Nur ich'
};
