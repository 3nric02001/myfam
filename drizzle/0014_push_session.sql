ALTER TABLE `push_subscription` ADD `session_id` text REFERENCES session(id) ON DELETE cascade;
