CREATE TABLE IF NOT EXISTS `librarian_schema_migrations` (
  `version` integer PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `applied_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `books_sort_idx` ON `books` (`category`, `author`, `series`, `title`);
INSERT OR IGNORE INTO `librarian_schema_migrations`
  (`version`, `name`, `applied_at`)
VALUES (3, 'durable additive book schema', unixepoch() * 1000);
