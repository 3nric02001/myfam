import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const user = sqliteTable('user', {
	id: id(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash').notNull(),
	createdAt: createdAt()
});

export const family = sqliteTable('family', {
	id: id(),
	name: text('name').notNull(),
	createdAt: createdAt()
});

export type Role = 'admin' | 'member';

export const membership = sqliteTable(
	'membership',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		role: text('role').$type<Role>().notNull().default('member'),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.userId, t.familyId] })]
);

/** The session id is the SHA-256 hash of the token stored in the cookie. */
export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	/** The family the user is currently looking at. */
	familyId: text('family_id').references(() => family.id, { onDelete: 'set null' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

/** The invite id is the SHA-256 hash of the token in the invite link. */
export const invite = sqliteTable('invite', {
	id: text('id').primaryKey(),
	familyId: text('family_id')
		.notNull()
		.references(() => family.id, { onDelete: 'cascade' }),
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: createdAt()
});

export const shoppingItem = sqliteTable(
	'shopping_item',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		quantity: text('quantity'),
		done: integer('done', { mode: 'boolean' }).notNull().default(false),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('shopping_item_family_idx').on(t.familyId)]
);

/** Who can see an entry: the whole family (default), selected members, or only its creator. */
export type Visibility = 'family' | 'shared' | 'private';

export const planningFolder = sqliteTable(
	'planning_folder',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		visibility: text('visibility').$type<Visibility>().notNull().default('family'),
		// Kept when the creator's account is deleted, so family folders survive.
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('planning_folder_family_idx').on(t.familyId)]
);

/** Members a folder with visibility 'shared' is shared with (besides its creator). */
export const planningFolderShare = sqliteTable(
	'planning_folder_share',
	{
		folderId: text('folder_id')
			.notNull()
			.references(() => planningFolder.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.folderId, t.userId] })]
);

export const planningCard = sqliteTable(
	'planning_card',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		folderId: text('folder_id')
			.notNull()
			.references(() => planningFolder.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('planning_card_folder_idx').on(t.folderId)]
);

export type BlockType = 'text' | 'table' | 'link' | 'image';

/**
 * One piece of content on a card. `data` is JSON whose shape depends on `type`:
 * text {text}, table {rows: string[][]}, link {url, title}, image {imageId, caption}.
 */
export const planningBlock = sqliteTable(
	'planning_block',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		cardId: text('card_id')
			.notNull()
			.references(() => planningCard.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		type: text('type').$type<BlockType>().notNull(),
		data: text('data', { mode: 'json' }).notNull(),
		createdAt: createdAt()
	},
	(t) => [index('planning_block_card_idx').on(t.cardId)]
);

/** An uploaded image. The file lives in the uploads folder next to the database, named by id. */
export const planningImage = sqliteTable('planning_image', {
	id: id(),
	familyId: text('family_id')
		.notNull()
		.references(() => family.id, { onDelete: 'cascade' }),
	cardId: text('card_id')
		.notNull()
		.references(() => planningCard.id, { onDelete: 'cascade' }),
	mimeType: text('mime_type').notNull(),
	size: integer('size').notNull(),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: createdAt()
});

export type User = typeof user.$inferSelect;
export type Family = typeof family.$inferSelect;
export type ShoppingItem = typeof shoppingItem.$inferSelect;
