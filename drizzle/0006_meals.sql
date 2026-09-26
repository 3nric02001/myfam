CREATE TABLE `meal` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`name` text NOT NULL,
	`ingredients` text,
	`added_to_list` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_family_day_slot_idx` ON `meal` (`family_id`,`date`,`slot`);