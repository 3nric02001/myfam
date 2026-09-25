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
	/** Bundesland code (e.g. 'BY') for regional holidays; null shows only nationwide ones. */
	state: text('state'),
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

/** Who sees an event: the whole family, the creator plus chosen members, or only the creator. */
export type Visibility = 'family' | 'shared' | 'private';

/** Dates are stored as local 'YYYY-MM-DD' and times as 'HH:MM'; no time means all-day. */
export const calendarEvent = sqliteTable(
	'calendar_event',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		notes: text('notes'),
		startDate: text('start_date').notNull(),
		startTime: text('start_time'),
		endDate: text('end_date').notNull(),
		endTime: text('end_time'),
		visibility: text('visibility').$type<Visibility>().notNull().default('family'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('calendar_event_family_idx').on(t.familyId, t.startDate)]
);

/** Members an event with visibility 'shared' is shared with. */
export const calendarEventShare = sqliteTable(
	'calendar_event_share',
	{
		eventId: text('event_id')
			.notNull()
			.references(() => calendarEvent.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.eventId, t.userId] })]
);

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

/** Where a family shops: its postcode (for automatic offers) and the chosen stores. */
export const offerSettings = sqliteTable('offer_settings', {
	familyId: text('family_id')
		.primaryKey()
		.references(() => family.id, { onDelete: 'cascade' }),
	zip: text('zip'),
	/** Store ids from $lib/offers STORES. */
	stores: text('stores', { mode: 'json' }).$type<string[]>().notNull().default([]),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

/** An offer a family member typed in from a leaflet. Prices are in cents. */
export const offer = sqliteTable(
	'offer',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		store: text('store').notNull(),
		product: text('product').notNull(),
		price: integer('price'),
		/** Last day the offer is valid, 'YYYY-MM-DD'. */
		validUntil: text('valid_until').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('offer_family_idx').on(t.familyId, t.validUntil)]
);

/**
 * Offers fetched automatically for a search term and postcode, kept for a few hours so the
 * list page does not ask the source again on every load. Public data, shared by all families.
 */
export const offerSearchCache = sqliteTable(
	'offer_search_cache',
	{
		zip: text('zip').notNull(),
		query: text('query').notNull(),
		results: text('results', { mode: 'json' }).notNull(),
		fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.zip, t.query] })]
);

export type User = typeof user.$inferSelect;
export type Family = typeof family.$inferSelect;
export type ShoppingItem = typeof shoppingItem.$inferSelect;
export type CalendarEvent = typeof calendarEvent.$inferSelect;
