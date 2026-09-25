import type { Visibility } from '$lib/server/db/schema';
import { Lock, Users, UsersRound } from '@lucide/svelte';

// Shared by everything with the family / selected people / only me permission model
// (calendar events, planning folders). Server side see $lib/server/visibility.ts.

export const visibilityIcon = {
	family: UsersRound,
	shared: Users,
	private: Lock
} satisfies Record<Visibility, unknown>;

export const visibilityLabel: Record<Visibility, string> = {
	family: 'Ganze Familie',
	shared: 'Bestimmte Personen',
	private: 'Nur ich'
};
