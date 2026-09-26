CREATE TABLE `calendar_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`username` text,
	`password` text,
	`color` text DEFAULT 'blue' NOT NULL,
	`synced_at` integer,
	`error` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `calendar_subscription_family_idx` ON `calendar_subscription` (`family_id`);--> statement-breakpoint
CREATE TABLE `subscription_event` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`notes` text,
	`start_date` text NOT NULL,
	`start_time` text,
	`end_date` text NOT NULL,
	`end_time` text,
	FOREIGN KEY (`subscription_id`) REFERENCES `calendar_subscription`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscription_event_family_idx` ON `subscription_event` (`family_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `subscription_event_subscription_idx` ON `subscription_event` (`subscription_id`);