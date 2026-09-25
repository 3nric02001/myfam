CREATE TABLE `planning_block` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`card_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `planning_card`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `planning_block_card_idx` ON `planning_block` (`card_id`);--> statement-breakpoint
CREATE TABLE `planning_card` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`title` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `planning_folder`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planning_card_folder_idx` ON `planning_card` (`folder_id`);--> statement-breakpoint
CREATE TABLE `planning_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`visibility` text DEFAULT 'family' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planning_folder_family_idx` ON `planning_folder` (`family_id`);--> statement-breakpoint
CREATE TABLE `planning_folder_share` (
	`folder_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`folder_id`, `user_id`),
	FOREIGN KEY (`folder_id`) REFERENCES `planning_folder`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planning_image` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`card_id` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `planning_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
