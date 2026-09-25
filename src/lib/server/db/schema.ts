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

export type User = typeof user.$inferSelect;
export type Family = typeof family.$inferSelect;
export type ShoppingItem = typeof shoppingItem.$inferSelect;
