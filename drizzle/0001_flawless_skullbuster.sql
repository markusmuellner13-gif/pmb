ALTER TABLE `positions` ADD `category` text;--> statement-breakpoint
ALTER TABLE `positions` ADD `is_exploration` integer DEFAULT false NOT NULL;