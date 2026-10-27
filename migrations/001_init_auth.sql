-- ==============================================================================
-- ROM Vault Authentication & User Profile Database Schema
-- Compatible with MariaDB 10.4+ and MySQL 8.0+
-- Database: rom_vault
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `rom_vault` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `rom_vault`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `account_status` ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending',
  `failed_login_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_status` (`account_status`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `display_name` VARCHAR(100) NULL,
  `avatar_url` VARCHAR(255) NULL,
  `preferences` JSON NULL,
  `favorites` JSON NULL,
  `download_quota_daily` INT UNSIGNED NOT NULL DEFAULT 50,
  `download_count_today` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_download_reset` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `download_history` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_profiles_user_id` (`user_id`),
  CONSTRAINT `fk_profiles_user` FOREIGN KEY (`user_id`) 
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Auth Tokens & Sessions Table
CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `type` ENUM('session', 'email_verification', 'password_reset') NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_auth_tokens_token_hash` (`token_hash`),
  KEY `idx_auth_tokens_user_type` (`user_id`, `type`),
  KEY `idx_auth_tokens_expires` (`expires_at`),
  CONSTRAINT `fk_tokens_user` FOREIGN KEY (`user_id`) 
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Rate Limiting Table (Brute-Force & Credential Stuffing Prevention)
CREATE TABLE IF NOT EXISTS `rate_limit_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(32) NOT NULL,
  `identifier` VARCHAR(128) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rate_limit_lookup` (`action`, `identifier`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
