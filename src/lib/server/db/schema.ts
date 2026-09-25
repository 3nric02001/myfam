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

export type User = typeof user.$inferSelect;
export type Family = typeof family.$inferSelect;
export type ShoppingItem = typeof shoppingItem.$inferSelect;
export type CalendarEvent = typeof calendarEvent.$inferSelect;
