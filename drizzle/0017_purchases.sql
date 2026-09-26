CREATE TABLE `purchase` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`store` text NOT NULL,
	`date` text NOT NULL,
	`total` integer NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `purchase_family_date_idx` ON `purchase` (`family_id`,`date`);--> statement-breakpoint
CREATE TABLE `purchase_line` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`product` text NOT NULL,
	`price` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`weighed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchase`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purchase_line_purchase_idx` ON `purchase_line` (`purchase_id`);