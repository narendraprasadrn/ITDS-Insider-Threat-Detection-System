-- backend/db/migrations/007_policy_violations.sql
-- Phase 7: Policy evaluation of observed queries

USE `itds_app`;

CREATE TABLE IF NOT EXISTS `policy_violations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` BIGINT NOT NULL,
  `session_id` INT NULL,
  `user_id` INT NULL,
  `rule` VARCHAR(100) NOT NULL,
  `severity` ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  `reason` TEXT NOT NULL,
  `enforcement_type` ENUM('blocked_by_db', 'detected_post_hoc') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_violations_session` (`session_id`),
  INDEX `idx_violations_user` (`user_id`),
  INDEX `idx_violations_rule` (`rule`),
  INDEX `idx_violations_severity` (`severity`),
  INDEX `idx_violations_enforcement` (`enforcement_type`),
  CONSTRAINT `fk_violations_event` FOREIGN KEY (`event_id`) REFERENCES `sql_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_violations_session` FOREIGN KEY (`session_id`) REFERENCES `db_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_violations_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
