CREATE TABLE `planning_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `planning_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planning_comment_card_idx` ON `planning_comment` (`card_id`);