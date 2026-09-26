CREATE TABLE `known_price` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`key` text NOT NULL,
	`store` text NOT NULL,
	`product` text NOT NULL,
	`price` integer NOT NULL,
	`seen_on` text NOT NULL,
	`created_by` text,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `known_price_family_key_idx` ON `known_price` (`family_id`,`key`);--> statement-breakpoint
ALTER TABLE `offer` ADD `url` text;