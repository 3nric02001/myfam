CREATE TABLE `planning_card_seen` (
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `user_id`),
	FOREIGN KEY (`card_id`) REFERENCES `planning_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Everything that exists today counts as seen, so the dashboard starts empty instead of listing every card.
INSERT INTO `planning_card_seen` (`card_id`, `user_id`, `seen_at`)
SELECT `c`.`id`, `m`.`user_id`, unixepoch() FROM `planning_card` `c`
INNER JOIN `membership` `m` ON `m`.`family_id` = `c`.`family_id`;
