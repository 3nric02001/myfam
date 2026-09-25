import type { Visibility } from '$lib/server/db/schema';

// Shared by everything with the family / selected people / only me permission model
// (calendar events, planning folders). Server side see $lib/server/visibility.ts.

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
