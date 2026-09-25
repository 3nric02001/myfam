CREATE TABLE `offer_match_rule` (
	`family_id` text NOT NULL,
	`term` text NOT NULL,
	`variant` text NOT NULL,
	`example` text NOT NULL,
	`fits` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`family_id`, `term`, `variant`),
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shopping_history` (
	`family_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`uses` integer DEFAULT 1 NOT NULL,
	`last_used_at` integer NOT NULL,
	PRIMARY KEY(`family_id`, `key`),
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `offer` ADD `valid_from` text;--> statement-breakpoint
INSERT INTO `shopping_history` (`family_id`, `key`, `name`, `uses`, `last_used_at`)
SELECT `family_id`, lower(trim(`name`)), trim(`name`), count(*), max(`created_at`)
FROM `shopping_item` GROUP BY `family_id`, lower(trim(`name`));
