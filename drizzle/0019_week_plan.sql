CREATE TABLE `week_plan` (
	`family_id` text NOT NULL,
	`week` text NOT NULL,
	`done_by` text,
	`done_at` integer NOT NULL,
	PRIMARY KEY(`family_id`, `week`),
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`done_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
