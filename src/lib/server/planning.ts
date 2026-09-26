import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import {
	planningBlock,
	planningCard,
	planningCardSeen,
	planningComment,
	planningFolder,
	planningFolderShare,
	planningImage,
	membership,
	user,
	type BlockType,
	type Visibility
} from './db/schema';
import { visibleTo, type VisibilityInput } from './visibility';
import { sendToUsers, type Sender } from './push';
import {
	LIMITS,
	type Block,
	type ImageData,
	type LinkData,
	type TableData,
	type TextData
} from '$lib/planning';

// Every query is scoped to a family and to what the user may see. Cards, blocks and images
// inherit the permissions of their folder: whoever sees a folder may edit its cards.
// Only the creator may change who sees a folder; admins may rename or delete family folders.

export type Viewer = { familyId: string; userId: string; isAdmin: boolean };

const folderVisible = (userId: string) =>
	visibleTo(userId, planningFolder, {
		table: planningFolderShare,
		itemId: planningFolderShare.folderId,
		userId: planningFolderShare.userId
	});

// ---------- Folders ----------

export async function listFolders(db: DB, v: Viewer) {
	const cardCount = db
		.select({ folderId: planningCard.folderId, count: sql<number>`count(*)`.as('count') })
		.from(planningCard)
		.where(eq(planningCard.familyId, v.familyId))
		.groupBy(planningCard.folderId)
		.as('card_count');

	return db
		.select({
			id: planningFolder.id,
			name: planningFolder.name,
			visibility: planningFolder.visibility,
			createdById: planningFolder.createdBy,
			createdBy: user.name,
			cards: sql<number>`coalesce(${cardCount.count}, 0)`
		})
		.from(planningFolder)
		.leftJoin(user, eq(planningFolder.createdBy, user.id))
		.leftJoin(cardCount, eq(cardCount.folderId, planningFolder.id))
		.where(and(eq(planningFolder.familyId, v.familyId), folderVisible(v.userId)))
		.orderBy(sql`${planningFolder.name} collate nocase`);
}

/** The folder, if the viewer may see it, with the ids and names it is shared with. */
export async function getFolder(db: DB, v: Viewer, folderId: string) {
	const [folder] = await db
		.select({
			id: planningFolder.id,
			name: planningFolder.name,
			visibility: planningFolder.visibility,
			createdById: planningFolder.createdBy,
			createdBy: user.name
		})
		.from(planningFolder)
		.leftJoin(user, eq(planningFolder.createdBy, user.id))
		.where(
			and(
				eq(planningFolder.familyId, v.familyId),
				eq(planningFolder.id, folderId),
				folderVisible(v.userId)
			)
		);
	if (!folder) return null;

	const shares = await db
		.select({ id: user.id, name: user.name })
		.from(planningFolderShare)
		.innerJoin(user, eq(planningFolderShare.userId, user.id))
		.where(eq(planningFolderShare.folderId, folder.id))
		.orderBy(sql`${user.name} collate nocase`);

	return {
		...folder,
		sharedWith: shares,
		isCreator: folder.createdById === v.userId,
		// Same rule as for calendar events: admins may tidy up family folders, not private ones.
		canManage: folder.createdById === v.userId || (v.isAdmin && folder.visibility === 'family')
	};
}

export async function createFolder(db: DB, v: Viewer, name: string, access: VisibilityInput) {
	return db.transaction((tx) => {
		const row = tx
			.insert(planningFolder)
			.values({
				familyId: v.familyId,
				createdBy: v.userId,
				name: name.trim(),
				visibility: access.visibility
			})
			.returning()
			.get();
		writeShares(tx, row.id, access);
		return row;
	});
}

export async function updateFolder(
	db: DB,
	v: Viewer,
	folderId: string,
	name: string,
	access: VisibilityInput
) {
	const folder = await getFolder(db, v, folderId);
	if (!folder?.canManage) return false;
	db.transaction((tx) => {
		tx.update(planningFolder)
			.set({ name: name.trim() })
			.where(eq(planningFolder.id, folder.id))
			.run();
		// Only the creator decides who sees the folder.
		if (!folder.isCreator) return;
		tx.update(planningFolder)
			.set({ visibility: access.visibility })
			.where(eq(planningFolder.id, folder.id))
			.run();
		tx.delete(planningFolderShare).where(eq(planningFolderShare.folderId, folder.id)).run();
		writeShares(tx, folder.id, access);
	});
	return true;
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

function writeShares(tx: Tx, folderId: string, access: VisibilityInput) {
	if (access.visibility !== 'shared' || access.shareWith.length === 0) return;
	tx.insert(planningFolderShare)
		.values(access.shareWith.map((userId) => ({ folderId, userId })))
		.run();
}

/** Deletes the folder with all cards. Returns the ids of image files to remove, or null. */
export async function deleteFolder(db: DB, v: Viewer, folderId: string) {
	const folder = await getFolder(db, v, folderId);
	if (!folder?.canManage) return null;
	const images = await db
		.select({ id: planningImage.id })
		.from(planningImage)
		.innerJoin(planningCard, eq(planningImage.cardId, planningCard.id))
		.where(eq(planningCard.folderId, folder.id));
	await db.delete(planningFolder).where(eq(planningFolder.id, folder.id));
	return images.map((i) => i.id);
}

// ---------- Cards ----------

export async function listCards(db: DB, v: Viewer, folderId: string) {
	if (!(await getFolder(db, v, folderId))) return [];
	return db
		.select({
			id: planningCard.id,
			title: planningCard.title,
			updatedAt: planningCard.updatedAt,
			blocks: sql<number>`(select count(*) from planning_block b where b.card_id = planning_card.id)`,
			comments: sql<number>`(select count(*) from planning_comment c where c.card_id = planning_card.id)`
		})
		.from(planningCard)
		.where(and(eq(planningCard.familyId, v.familyId), eq(planningCard.folderId, folderId)))
		.orderBy(desc(planningCard.updatedAt), asc(planningCard.title));
}

export async function createCard(db: DB, v: Viewer, folderId: string, title: string) {
	if (!(await getFolder(db, v, folderId))) return null;
	const [row] = await db
		.insert(planningCard)
		.values({ familyId: v.familyId, folderId, createdBy: v.userId, title: title.trim() })
		.returning();
	return row;
}

/** The card with its folder, if the viewer may see the folder. */
export async function getCard(db: DB, v: Viewer, cardId: string) {
	const [card] = await db
		.select({
			id: planningCard.id,
			title: planningCard.title,
			folderId: planningCard.folderId,
			folderName: planningFolder.name,
			visibility: planningFolder.visibility,
			updatedAt: planningCard.updatedAt,
			createdBy: user.name
		})
		.from(planningCard)
		.innerJoin(planningFolder, eq(planningCard.folderId, planningFolder.id))
		.leftJoin(user, eq(planningCard.createdBy, user.id))
		.where(
			and(
				eq(planningCard.familyId, v.familyId),
				eq(planningCard.id, cardId),
				folderVisible(v.userId)
			)
		);
	return card ?? null;
}

export async function renameCard(db: DB, v: Viewer, cardId: string, title: string) {
	if (!(await getCard(db, v, cardId))) return false;
	await db
		.update(planningCard)
		.set({ title: title.trim(), updatedAt: new Date() })
		.where(eq(planningCard.id, cardId));
	return true;
}

/** Deletes the card. Returns the ids of image files to remove, or null. */
export async function deleteCard(db: DB, v: Viewer, cardId: string) {
	if (!(await getCard(db, v, cardId))) return null;
	const images = await db
		.select({ id: planningImage.id })
		.from(planningImage)
		.where(eq(planningImage.cardId, cardId));
	await db.delete(planningCard).where(eq(planningCard.id, cardId));
	return images.map((i) => i.id);
}

async function touchCard(db: DB, cardId: string) {
	await db.update(planningCard).set({ updatedAt: new Date() }).where(eq(planningCard.id, cardId));
}

// ---------- Blocks ----------

/** Validates block content from a form. Returns the data to store or an error message. */
export function parseBlock(
	type: string,
	form: FormData
): { type: BlockType; data: TextData | TableData | LinkData } | { error: string } {
	const str = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value : '';
	};

	if (type === 'text') {
		const text = str('text').replace(/\r\n/g, '\n').trimEnd();
		if (!text.trim()) return { error: 'Der Text ist leer.' };
		if (text.length > LIMITS.text) return { error: 'Der Text ist zu lang.' };
		return { type, data: { text } };
	}

	if (type === 'table') {
		let rows: unknown;
		try {
			rows = JSON.parse(str('rows'));
		} catch {
			return { error: 'Die Tabelle konnte nicht gelesen werden.' };
		}
		if (
			!Array.isArray(rows) ||
			rows.length === 0 ||
			!rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === 'string'))
		) {
			return { error: 'Die Tabelle konnte nicht gelesen werden.' };
		}
		const cols = Math.max(1, ...rows.map((r: string[]) => r.length));
		if (rows.length > LIMITS.tableRows || cols > LIMITS.tableCols) {
			return {
				error: `Eine Tabelle darf höchstens ${LIMITS.tableRows} Zeilen und ${LIMITS.tableCols} Spalten haben.`
			};
		}
		if (rows.some((r: string[]) => r.some((c) => c.length > LIMITS.cell))) {
			return { error: 'Eine Zelle ist zu lang.' };
		}
		// Make the table rectangular so every row has the same number of cells.
		const data = (rows as string[][]).map((r) =>
			Array.from({ length: cols }, (_, i) => (r[i] ?? '').trim())
		);
		return { type, data: { rows: data } };
	}

	if (type === 'link') {
		const raw = str('url').trim();
		const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return { error: 'Das ist kein gültiger Link.' };
		}
		if (!raw || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
			return { error: 'Das ist kein gültiger Link.' };
		}
		if (url.length > LIMITS.url) return { error: 'Der Link ist zu lang.' };
		const title = str('title').trim().slice(0, LIMITS.caption);
		return { type, data: { url: parsed.href, title } };
	}

	return { error: 'Unbekannter Inhalt.' };
}

export async function listBlocks(db: DB, v: Viewer, cardId: string): Promise<Block[]> {
	if (!(await getCard(db, v, cardId))) return [];
	const rows = await db
		.select({ id: planningBlock.id, type: planningBlock.type, data: planningBlock.data })
		.from(planningBlock)
		.where(and(eq(planningBlock.familyId, v.familyId), eq(planningBlock.cardId, cardId)))
		.orderBy(asc(planningBlock.position), asc(planningBlock.createdAt));
	return rows as Block[];
}

export async function addBlock(
	db: DB,
	v: Viewer,
	cardId: string,
	block: { type: BlockType; data: TextData | TableData | LinkData | ImageData }
) {
	if (!(await getCard(db, v, cardId))) return null;
	const [{ last }] = await db
		.select({ last: max(planningBlock.position) })
		.from(planningBlock)
		.where(eq(planningBlock.cardId, cardId));
	const [row] = await db
		.insert(planningBlock)
		.values({
			familyId: v.familyId,
			cardId,
			position: (last ?? -1) + 1,
			type: block.type,
			data: block.data
		})
		.returning();
	await touchCard(db, cardId);
	return row;
}

async function findBlock(db: DB, v: Viewer, cardId: string, blockId: string) {
	if (!(await getCard(db, v, cardId))) return null;
	const [row] = await db
		.select()
		.from(planningBlock)
		.where(
			and(
				eq(planningBlock.familyId, v.familyId),
				eq(planningBlock.cardId, cardId),
				eq(planningBlock.id, blockId)
			)
		);
	return row ?? null;
}

/** Replaces the content of a block. The type of a block cannot change. */
export async function updateBlock(
	db: DB,
	v: Viewer,
	cardId: string,
	blockId: string,
	data: TextData | TableData | LinkData | ImageData
) {
	const block = await findBlock(db, v, cardId, blockId);
	if (!block) return false;
	await db.update(planningBlock).set({ data }).where(eq(planningBlock.id, block.id));
	await touchCard(db, cardId);
	return true;
}

export async function getBlock(db: DB, v: Viewer, cardId: string, blockId: string) {
	const block = await findBlock(db, v, cardId, blockId);
	return block as (Block & { position: number }) | null;
}

/** Deletes a block. Returns the id of its image file to remove, if any, or null if not found. */
export async function deleteBlock(db: DB, v: Viewer, cardId: string, blockId: string) {
	const block = await findBlock(db, v, cardId, blockId);
	if (!block) return null;
	await db.delete(planningBlock).where(eq(planningBlock.id, block.id));
	const imageIds: string[] = [];
	if (block.type === 'image') {
		const { imageId } = block.data as ImageData;
		await db.delete(planningImage).where(eq(planningImage.id, imageId));
		imageIds.push(imageId);
	}
	await touchCard(db, cardId);
	return imageIds;
}

/** Swaps a block with its neighbour above (-1) or below (+1). */
export async function moveBlock(
	db: DB,
	v: Viewer,
	cardId: string,
	blockId: string,
	direction: -1 | 1
) {
	const blocks = await listBlocks(db, v, cardId);
	const index = blocks.findIndex((b) => b.id === blockId);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= blocks.length) return;
	[blocks[index], blocks[target]] = [blocks[target], blocks[index]];
	db.transaction((tx) => {
		blocks.forEach((b, position) =>
			tx.update(planningBlock).set({ position }).where(eq(planningBlock.id, b.id)).run()
		);
	});
	await touchCard(db, cardId);
}

// ---------- Comments ----------

export const MAX_COMMENT_LENGTH = 2000;

/** Checks a comment. Returns the cleaned text or an error message. */
export function checkComment(raw: string): { text: string } | { error: string } {
	const text = raw.replace(/\r\n/g, '\n').trim();
	if (!text) return { error: 'Der Kommentar ist leer.' };
	if (text.length > MAX_COMMENT_LENGTH) return { error: 'Der Kommentar ist zu lang.' };
	return { text };
}

export async function listComments(db: DB, v: Viewer, cardId: string) {
	if (!(await getCard(db, v, cardId))) return [];
	const rows = await db
		.select({
			id: planningComment.id,
			text: planningComment.text,
			authorId: planningComment.userId,
			author: user.name,
			createdAt: planningComment.createdAt,
			editedAt: planningComment.editedAt
		})
		.from(planningComment)
		.leftJoin(user, eq(planningComment.userId, user.id))
		.where(and(eq(planningComment.familyId, v.familyId), eq(planningComment.cardId, cardId)))
		.orderBy(asc(planningComment.createdAt), sql`planning_comment.rowid`);
	return rows.map(({ authorId, ...c }) => ({ ...c, isOwn: authorId === v.userId }));
}

export async function addComment(db: DB, v: Viewer, cardId: string, text: string) {
	if (!(await getCard(db, v, cardId))) return null;
	const [row] = await db
		.insert(planningComment)
		.values({ familyId: v.familyId, cardId, userId: v.userId, text })
		.returning();
	return row;
}

/** Everyone in the family who may see the card, i.e. its folder. */
async function cardAudience(db: DB, familyId: string, cardId: string) {
	const members = await db
		.select({ userId: membership.userId })
		.from(membership)
		.where(eq(membership.familyId, familyId));
	const [folder] = await db
		.select({
			id: planningFolder.id,
			visibility: planningFolder.visibility,
			createdBy: planningFolder.createdBy
		})
		.from(planningCard)
		.innerJoin(planningFolder, eq(planningCard.folderId, planningFolder.id))
		.where(and(eq(planningCard.familyId, familyId), eq(planningCard.id, cardId)));
	if (!folder) return [];
	const ids = members.map((m) => m.userId);
	if (folder.visibility === 'family') return ids;
	const shares =
		folder.visibility === 'shared'
			? await db
					.select({ userId: planningFolderShare.userId })
					.from(planningFolderShare)
					.where(eq(planningFolderShare.folderId, folder.id))
			: [];
	const allowed = new Set([folder.createdBy, ...shares.map((s) => s.userId)]);
	return ids.filter((id) => allowed.has(id));
}

/**
 * Tells everyone else who may see the card about a new comment, on their devices with push
 * switched on. Returns how many devices got it.
 */
export async function notifyComment(db: DB, v: Viewer, cardId: string, text: string, send: Sender) {
	const card = await getCard(db, v, cardId);
	if (!card) return 0;
	const [author] = await db.select({ name: user.name }).from(user).where(eq(user.id, v.userId));
	const recipients = (await cardAudience(db, v.familyId, cardId)).filter((id) => id !== v.userId);
	const body = text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
	return sendToUsers(
		db,
		recipients,
		{
			title: `${author?.name ?? 'Jemand'} zu „${card.title}“`,
			body,
			url: `/planung/${card.folderId}/${card.id}`,
			// Newer comments on the same card replace the older notification.
			tag: `comment:${card.id}`
		},
		send
	);
}

/** Only the author may change their comment. */
export async function updateComment(
	db: DB,
	v: Viewer,
	cardId: string,
	commentId: string,
	text: string
) {
	if (!(await getCard(db, v, cardId))) return false;
	const changed = await db
		.update(planningComment)
		.set({ text, editedAt: new Date() })
		.where(
			and(
				eq(planningComment.familyId, v.familyId),
				eq(planningComment.cardId, cardId),
				eq(planningComment.id, commentId),
				eq(planningComment.userId, v.userId)
			)
		)
		.returning({ id: planningComment.id });
	return changed.length > 0;
}

/** Only the author may delete their comment. */
export async function deleteComment(db: DB, v: Viewer, cardId: string, commentId: string) {
	if (!(await getCard(db, v, cardId))) return false;
	const deleted = await db
		.delete(planningComment)
		.where(
			and(
				eq(planningComment.familyId, v.familyId),
				eq(planningComment.cardId, cardId),
				eq(planningComment.id, commentId),
				eq(planningComment.userId, v.userId)
			)
		)
		.returning({ id: planningComment.id });
	return deleted.length > 0;
}

// ---------- Seen ----------

/** Remembers that the viewer has looked at the card as it is now. */
export async function markCardSeen(db: DB, v: Viewer, cardId: string, now = new Date()) {
	if (!(await getCard(db, v, cardId))) return false;
	await db
		.insert(planningCardSeen)
		.values({ cardId, userId: v.userId, seenAt: now })
		.onConflictDoUpdate({
			target: [planningCardSeen.cardId, planningCardSeen.userId],
			set: { seenAt: now }
		});
	return true;
}

/** Only look this far back, so someone who joins a family isn't greeted by every old card. */
export const UNSEEN_DAYS = 30;

/**
 * Cards the viewer may see with something they haven't looked at yet: new cards from others,
 * cards changed since their last visit, and comments by others since then.
 */
export async function listUnseen(db: DB, v: Viewer, now = new Date()) {
	const since = Math.floor(now.getTime() / 1000) - UNSEEN_DAYS * 86_400;
	const seenAt = sql<number | null>`(select s.seen_at from planning_card_seen s
		where s.card_id = ${planningCard.id} and s.user_id = ${v.userId})`;
	const newerThanSeen = (column: string) => {
		const col = sql.raw(column);
		return sql`${col} > coalesce(${seenAt}, 0) and ${col} >= ${since}`;
	};
	const othersComments = sql`from planning_comment c where c.card_id = ${planningCard.id}
		and (c.user_id is null or c.user_id <> ${v.userId}) and ${newerThanSeen('c.created_at')}`;

	const rows = await db
		.select({
			id: planningCard.id,
			title: planningCard.title,
			folderId: planningCard.folderId,
			folderName: planningFolder.name,
			updatedAt: planningCard.updatedAt,
			seenAt,
			createdById: planningCard.createdBy,
			createdAt: planningCard.createdAt,
			newComments: sql<number>`(select count(*) ${othersComments})`,
			lastCommentId: sql<string | null>`(select c.id ${othersComments}
				order by c.created_at desc, c.rowid desc limit 1)`
		})
		.from(planningCard)
		.innerJoin(planningFolder, eq(planningCard.folderId, planningFolder.id))
		.where(
			and(
				eq(planningCard.familyId, v.familyId),
				folderVisible(v.userId),
				sql`(${planningCard.updatedAt} >= ${since} or exists (select 1 ${othersComments}))`
			)
		)
		.orderBy(desc(planningCard.updatedAt));

	const items = rows
		.map((r) => {
			const isNew = r.seenAt === null && r.createdById !== v.userId;
			const changed =
				!isNew && r.seenAt !== null && r.updatedAt.getTime() / 1000 > Number(r.seenAt);
			return { ...r, isNew, changed };
		})
		.filter((r) => r.isNew || r.changed || r.newComments > 0);

	const commentIds = items.flatMap((i) => (i.lastCommentId ? [i.lastCommentId] : []));
	const comments = commentIds.length
		? await db
				.select({
					id: planningComment.id,
					text: planningComment.text,
					author: user.name,
					createdAt: planningComment.createdAt
				})
				.from(planningComment)
				.leftJoin(user, eq(planningComment.userId, user.id))
				.where(inArray(planningComment.id, commentIds))
		: [];
	const byId = new Map(comments.map((c) => [c.id, c]));

	return items
		.map(
			({
				id,
				title,
				folderId,
				folderName,
				updatedAt,
				isNew,
				changed,
				newComments,
				lastCommentId
			}) => {
				const lastComment = lastCommentId ? (byId.get(lastCommentId) ?? null) : null;
				const at = Math.max(updatedAt.getTime(), lastComment?.createdAt.getTime() ?? 0);
				return { id, title, folderId, folderName, isNew, changed, newComments, lastComment, at };
			}
		)
		.sort((a, b) => b.at - a.at);
}

/** Marks every card the viewer may see as seen. */
export async function markAllSeen(db: DB, v: Viewer, now = new Date()) {
	const cards = await listUnseen(db, v, now);
	for (const card of cards) await markCardSeen(db, v, card.id, now);
	return cards.length;
}

// ---------- Images ----------

export async function addImage(
	db: DB,
	v: Viewer,
	cardId: string,
	image: { mimeType: string; size: number }
) {
	if (!(await getCard(db, v, cardId))) return null;
	const [row] = await db
		.insert(planningImage)
		.values({ familyId: v.familyId, cardId, createdBy: v.userId, ...image })
		.returning();
	return row;
}

/** Image metadata, if the viewer may see the card it belongs to. */
export async function getImage(db: DB, v: Viewer, imageId: string) {
	const [image] = await db
		.select({
			id: planningImage.id,
			mimeType: planningImage.mimeType,
			cardId: planningImage.cardId
		})
		.from(planningImage)
		.where(and(eq(planningImage.familyId, v.familyId), eq(planningImage.id, imageId)));
	if (!image || !(await getCard(db, v, image.cardId))) return null;
	return image;
}

export async function removeImageRecords(db: DB, v: Viewer, ids: string[]) {
	if (ids.length === 0) return;
	await db
		.delete(planningImage)
		.where(and(eq(planningImage.familyId, v.familyId), inArray(planningImage.id, ids)));
}

export { LIMITS };
export type { Block, Visibility };
