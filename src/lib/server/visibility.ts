import { sql, type AnyColumn } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Visibility } from './db/schema';

// Shared permission model for family content (calendar events, planning folders):
// 'family' is visible to every member, 'shared' to the creator plus selected members,
// 'private' only to the creator.

export const VISIBILITIES: Visibility[] = ['family', 'shared', 'private'];

export type VisibilityInput = { visibility: Visibility; shareWith: string[] };

/**
 * Reads the `visibility` field and the repeated `sharedWith` fields (see VisibilityPicker.svelte) of a form.
 * Only members of the family can be selected, and the creator never needs a share row.
 */
export function parseVisibility(
	form: FormData,
	memberIds: string[],
	selfId: string
): VisibilityInput | { error: string } {
	const raw = form.get('visibility');
	const visibility = VISIBILITIES.find((v) => v === raw) ?? 'family';
	if (visibility !== 'shared') return { visibility, shareWith: [] };

	const members = new Set(memberIds);
	const shareWith = [
		...new Set(form.getAll('sharedWith').filter((v): v is string => typeof v === 'string'))
	].filter((id) => id !== selfId && members.has(id));
	if (shareWith.length === 0) return { error: 'Wähle mindestens eine Person aus.' };
	return { visibility, shareWith };
}

/**
 * SQL condition: the row is visible to `userId`. Pass the item's columns and its share table.
 * The family itself must be checked separately (every query filters by family_id).
 */
export function visibleTo(
	userId: string,
	item: { id: AnyColumn; visibility: AnyColumn; createdBy: AnyColumn },
	share: { table: SQLiteTable; itemId: AnyColumn; userId: AnyColumn }
) {
	return sql`(${item.visibility} = 'family' or ${item.createdBy} = ${userId} or (${item.visibility} = 'shared' and exists (select 1 from ${share.table} where ${share.itemId} = ${item.id} and ${share.userId} = ${userId})))`;
}
