-- Migration 002: User-Scoped PlayStation 1 Virtual Memory Cards

USE `rom_vault`;

CREATE TABLE IF NOT EXISTS `user_memory_cards` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `slot_index` TINYINT UNSIGNED NOT NULL,
  `card_name` VARCHAR(100) NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `size_bytes` INT UNSIGNED NOT NULL DEFAULT 131072,
  `checksum` CHAR(64) NOT NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cards_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uq_user_slot` UNIQUE (`user_id`, `slot_index`),
  CONSTRAINT `chk_slot_range` CHECK (`slot_index` >= 1 AND `slot_index` <= 250)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS `idx_user_card_boot` ON `user_memory_cards` (`user_id`, `slot_index`);
