CREATE TABLE `shopping_category` (
	`family_id` text NOT NULL,
	`key` text NOT NULL,
	`category` text NOT NULL,
	PRIMARY KEY(`family_id`, `key`),
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
