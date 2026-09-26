import { sql } from 'drizzle-orm';
import {
	integer,
	primaryKey,
	sqliteTable,
	text,
	index,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

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
		/**
		 * Minutes before the start to send a push reminder; null means none. All-day events start
		 * at 00:00, so 360 is 18:00 the day before and -480 is 08:00 on the day.
		 */
		reminder: integer('reminder'),
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

/** A comment on a planning card, visible to everyone who can see the card. */
export const planningComment = sqliteTable(
	'planning_comment',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		cardId: text('card_id')
			.notNull()
			.references(() => planningCard.id, { onDelete: 'cascade' }),
		// Kept (without a name) when the author's account is deleted.
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		text: text('text').notNull(),
		createdAt: createdAt(),
		/** Set when the author changed the comment. */
		editedAt: integer('edited_at', { mode: 'timestamp' })
	},
	(t) => [index('planning_comment_card_idx').on(t.cardId)]
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
		/** First day the offer is valid, 'YYYY-MM-DD'. */
		validFrom: text('valid_from'),
		/** Last day the offer is valid, 'YYYY-MM-DD'. */
		validUntil: text('valid_until').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('offer_family_idx').on(t.familyId, t.validUntil)]
);

/**
 * The family's answer to "does this count as <entry>?" for an uncertain kind of offer, e.g.
 * term 'milch', variant 'muellermilch', fits false.
 */
export const offerMatchRule = sqliteTable(
	'offer_match_rule',
	{
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		term: text('term').notNull(),
		variant: text('variant').notNull(),
		/** Example product the question was asked with, to show the answer later. */
		example: text('example').notNull(),
		fits: integer('fits', { mode: 'boolean' }).notNull(),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.familyId, t.term, t.variant] })]
);

/** A family's own section for a list entry, overriding the keyword guess. Keyed like categoryKey(). */
export const shoppingCategory = sqliteTable(
	'shopping_category',
	{
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		category: text('category').notNull()
	},
	(t) => [primaryKey({ columns: [t.familyId, t.key] })]
);

/** Everything a family has put on the shopping list, for suggestions. Keyed by lowercase name. */
export const shoppingHistory = sqliteTable(
	'shopping_history',
	{
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		name: text('name').notNull(),
		uses: integer('uses').notNull().default(1),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.familyId, t.key] })]
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

/** Key/value settings of the installation, e.g. the generated VAPID keys for push. */
export const appSetting = sqliteTable('app_setting', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/** One device (browser) of a user that receives push notifications. */
export const pushSubscription = sqliteTable(
	'push_subscription',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		/** Short device description shown in the settings, e.g. "iPhone · Safari". */
		device: text('device'),
		createdAt: createdAt()
	},
	(t) => [index('push_subscription_user_idx').on(t.userId)]
);

/**
 * Reminders already sent, so a restart or the next scheduler run doesn't send them twice.
 * The key includes the time the reminder was due, so moving an event reminds again.
 */
export const reminderSent = sqliteTable('reminder_sent', {
	key: text('key').primaryKey(),
	sentAt: integer('sent_at', { mode: 'timestamp' }).notNull()
});
/**
 * A calendar the family follows: a CalDAV calendar (e.g. Nextcloud) or a public ICS link.
 * Read only. The password is stored encrypted (see server/secrets.ts).
 */
export const calendarSubscription = sqliteTable(
	'calendar_subscription',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		url: text('url').notNull(),
		username: text('username'),
		password: text('password'),
		color: text('color').notNull().default('blue'),
		syncedAt: integer('synced_at', { mode: 'timestamp' }),
		/** Message of the last failed sync, cleared by the next successful one. */
		error: text('error'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('calendar_subscription_family_idx').on(t.familyId)]
);

/**
 * Occurrences of subscribed events, replaced on every sync. Repeating events are expanded
 * (see server/ical.ts), so each row is one day range like a calendar_event.
 */
export const subscriptionEvent = sqliteTable(
	'subscription_event',
	{
		/** Derived from subscription, UID and start, so it stays the same across syncs. */
		id: text('id').primaryKey(),
		subscriptionId: text('subscription_id')
			.notNull()
			.references(() => calendarSubscription.id, { onDelete: 'cascade' }),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		location: text('location'),
		notes: text('notes'),
		startDate: text('start_date').notNull(),
		startTime: text('start_time'),
		endDate: text('end_date').notNull(),
		endTime: text('end_time')
	},
	(t) => [
		index('subscription_event_family_idx').on(t.familyId, t.startDate),
		index('subscription_event_subscription_idx').on(t.subscriptionId)
	]
);

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/** The family's meal plan: at most one dish per day and meal. Everyone in the family sees it. */
export const meal = sqliteTable(
	'meal',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		/** Local 'YYYY-MM-DD', like calendar events. */
		date: text('date').notNull(),
		slot: text('slot').$type<MealSlot>().notNull(),
		name: text('name').notNull(),
		/** One ingredient per line, e.g. '500 g Nudeln'. */
		ingredients: text('ingredients'),
		/** Set once the ingredients were put on the shopping list. */
		addedToList: integer('added_to_list', { mode: 'boolean' }).notNull().default(false),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('meal_family_day_slot_idx').on(t.familyId, t.date, t.slot)]
);

/** To-dos of the family, due on a day and optionally assigned to one member. */
export const task = sqliteTable(
	'task',
	{
		id: id(),
		familyId: text('family_id')
			.notNull()
			.references(() => family.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		notes: text('notes'),
		/** Local 'YYYY-MM-DD', like calendar events. */
		dueDate: text('due_date').notNull(),
		assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
		visibility: text('visibility').$type<Visibility>().notNull().default('family'),
		doneAt: integer('done_at', { mode: 'timestamp' }),
		doneBy: text('done_by').references(() => user.id, { onDelete: 'set null' }),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('task_family_due_idx').on(t.familyId, t.dueDate)]
);

/** Members a task with visibility 'shared' is shared with. */
export const taskShare = sqliteTable(
	'task_share',
	{
		taskId: text('task_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.taskId, t.userId] })]
);

export type User = typeof user.$inferSelect;
export type Family = typeof family.$inferSelect;
export type ShoppingItem = typeof shoppingItem.$inferSelect;
export type CalendarEvent = typeof calendarEvent.$inferSelect;
export type CalendarSubscription = typeof calendarSubscription.$inferSelect;
