ALTER TABLE `books` ADD `word_count` integer;
ALTER TABLE `books` ADD `word_count_source` text;
UPDATE `books` SET `word_count` = `page_count` * 450,
  `word_count_source` = 'estimated'
  WHERE `word_count` IS NULL AND `page_count` IS NOT NULL;
