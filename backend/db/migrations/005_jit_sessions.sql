-- 005_jit_sessions.sql
-- Phase 5: JIT Access Requests, Approvals, and Database Sessions

USE `itds_app`;

DROP TABLE IF EXISTS `approvals`;
DROP TABLE IF EXISTS `db_sessions`;
DROP TABLE IF EXISTS `access_requests`;

-- 1. Access Requests table
CREATE TABLE `access_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `profile_id` INT NOT NULL,
  `requested_duration_minutes` INT NOT NULL DEFAULT 60,
  `justification` TEXT NOT NULL,
  `status` ENUM('pending', 'approved', 'denied', 'expired') NOT NULL DEFAULT 'pending',
  `decision_action` VARCHAR(30) NULL, -- 'allow', 'require_approval', 'deny'
  `decision_reasons` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ar_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ar_profile` FOREIGN KEY (`profile_id`) REFERENCES `access_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 2. Approvals table (records admin manual approvals or denials)
CREATE TABLE `approvals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT NOT NULL,
  `decided_by` INT NOT NULL,
  `decision` ENUM('approved', 'denied') NOT NULL,
  `comments` TEXT NULL,
  `decided_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_appr_req` FOREIGN KEY (`request_id`) REFERENCES `access_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_appr_admin` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. JIT Database Sessions table (active ephemeral MySQL user credentials & scopes)
CREATE TABLE `db_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `profile_id` INT NOT NULL,
  `status` ENUM('active', 'expired', 'revoked') NOT NULL DEFAULT 'active',
  `start_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `end_time` TIMESTAMP NOT NULL,
  `mysql_username` VARCHAR(60) NOT NULL UNIQUE,
  `granted_operations` JSON NOT NULL,
  `granted_resources` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_dbs_req` FOREIGN KEY (`request_id`) REFERENCES `access_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dbs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dbs_profile` FOREIGN KEY (`profile_id`) REFERENCES `access_profiles` (`id`) ON DELETE CASCADE,
  INDEX `idx_dbs_status` (`status`),
  INDEX `idx_dbs_end` (`end_time`),
  INDEX `idx_dbs_mysql_user` (`mysql_username`)
) ENGINE=InnoDB;
