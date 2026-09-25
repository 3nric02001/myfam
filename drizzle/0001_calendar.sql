CREATE TABLE `calendar_event` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`start_date` text NOT NULL,
	`start_time` text,
	`end_date` text NOT NULL,
	`end_time` text,
	`visibility` text DEFAULT 'family' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `calendar_event_family_idx` ON `calendar_event` (`family_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `calendar_event_share` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `calendar_event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `family` ADD `state` text;