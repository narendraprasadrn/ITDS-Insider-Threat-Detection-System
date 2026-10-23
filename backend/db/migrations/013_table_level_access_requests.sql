-- backend/db/migrations/013_table_level_access_requests.sql
-- Phase 13: Table-Level Access Requests & Delegated Approval Architecture

USE `itds_db`;

-- 1. Modify access_requests to support table-level requests
ALTER TABLE `access_requests`
  MODIFY COLUMN `profile_id` INT NULL,
  ADD COLUMN `request_type` ENUM('profile', 'table') NOT NULL DEFAULT 'profile' AFTER `user_id`,
  ADD COLUMN `target_table` VARCHAR(100) NULL AFTER `request_type`,
  ADD COLUMN `target_database` VARCHAR(100) DEFAULT 'itds_db' AFTER `target_table`,
  ADD INDEX `idx_ar_type_table` (`request_type`, `target_table`);
