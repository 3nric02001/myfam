CREATE TABLE `offer` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`store` text NOT NULL,
	`product` text NOT NULL,
	`price` integer,
	`valid_until` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offer_family_idx` ON `offer` (`family_id`,`valid_until`);--> statement-breakpoint
CREATE TABLE `offer_search_cache` (
	`zip` text NOT NULL,
	`query` text NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`zip`, `query`)
);
--> statement-breakpoint
CREATE TABLE `offer_settings` (
	`family_id` text PRIMARY KEY NOT NULL,
	`zip` text,
	`stores` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
