-- 006_sql_events.sql
-- Phase 6: Server-side SQL Activity Ingestion schema

USE `itds_app`;

DROP TABLE IF EXISTS `sql_events`;
DROP TABLE IF EXISTS `ingest_watermark`;

-- 1. SQL Events Table (Captured from mysql.general_log)
CREATE TABLE `sql_events` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NULL,
  `user_id` INT NULL,
  `mysql_username` VARCHAR(60) NOT NULL,
  `thread_id` BIGINT NOT NULL,
  `event_time` DATETIME(6) NOT NULL,
  `raw_sql` MEDIUMTEXT NOT NULL,
  `normalized_sql` MEDIUMTEXT NULL,
  `operation` VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  `tables` JSON NOT NULL, -- e.g. ["target_db.customers"]
  `rows_hint` INT NULL,
  `flags` JSON NULL, -- { has_where, select_star, has_limit, limit_count, has_union, is_ddl, has_comments, multi_statement }
  `source_log_id` VARCHAR(100) NULL,
  `status` ENUM('attributed', 'unattributed', 'backend_internal', 'parse_error') NOT NULL DEFAULT 'attributed',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_se_session` FOREIGN KEY (`session_id`) REFERENCES `db_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_se_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_se_session` (`session_id`),
  INDEX `idx_se_user` (`user_id`),
  INDEX `idx_se_username` (`mysql_username`),
  INDEX `idx_se_time` (`event_time`),
  INDEX `idx_se_op` (`operation`)
) ENGINE=InnoDB;

-- 2. Ingest Watermark Table (Tracks high-water mark for general_log polling)
CREATE TABLE `ingest_watermark` (
  `id` INT PRIMARY KEY,
  `last_event_time` DATETIME(6) NOT NULL,
  `last_thread_id` BIGINT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Initialize watermark to 1 minute ago
INSERT INTO `ingest_watermark` (`id`, `last_event_time`, `last_thread_id`)
VALUES (1, NOW(6) - INTERVAL 1 MINUTE, 0)
ON DUPLICATE KEY UPDATE `id` = 1;
