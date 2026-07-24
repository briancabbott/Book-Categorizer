CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`series` text,
	`category` text NOT NULL,
	`isbn` text,
	`front_image_key` text,
	`back_image_key` text,
	`created_at` integer NOT NULL
);
