-- backend/db/migrations/008_threat_detection.sql
-- Phase 8: Threat detection engine, behavioural baselines, risk scoring, and alerts

USE `itds_app`;

-- 1. Behavioural Baselines per User
CREATE TABLE IF NOT EXISTS `user_baselines` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `avg_velocity_qpm` FLOAT NOT NULL DEFAULT 5.0,
  `typical_tables` JSON NOT NULL,
  `typical_hours_start` INT NOT NULL DEFAULT 9,
  `typical_hours_end` INT NOT NULL DEFAULT 18,
  `sample_size_queries` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ub_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Explainable Session Risk Scores
CREATE TABLE IF NOT EXISTS `session_risk_scores` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NOT NULL UNIQUE,
  `user_id` INT NOT NULL,
  `score` INT NOT NULL DEFAULT 0,
  `risk_level` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  `breakdown` JSON NOT NULL,
  `calculated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_srs_user` (`user_id`),
  INDEX `idx_srs_risk_level` (`risk_level`),
  CONSTRAINT `fk_srs_session` FOREIGN KEY (`session_id`) REFERENCES `db_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_srs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Security Alerts Table
CREATE TABLE IF NOT EXISTS `alerts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `risk_score` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('open', 'investigating', 'closed') NOT NULL DEFAULT 'open',
  `severity` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'high',
  `evidence` JSON NOT NULL,
  `analyst_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_alerts_status` (`status`),
  INDEX `idx_alerts_severity` (`severity`),
  INDEX `idx_alerts_session` (`session_id`),
  INDEX `idx_alerts_user` (`user_id`),
  CONSTRAINT `fk_alert_session` FOREIGN KEY (`session_id`) REFERENCES `db_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_alert_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default user baselines for the 3 demo users
INSERT INTO `user_baselines` (`user_id`, `avg_velocity_qpm`, `typical_tables`, `typical_hours_start`, `typical_hours_end`, `sample_size_queries`)
SELECT id, 6.0, JSON_ARRAY('target_db.customers', 'target_db.orders'), 9, 18, 120
FROM `users`
WHERE `username` = 'developer'
ON DUPLICATE KEY UPDATE `avg_velocity_qpm` = VALUES(`avg_velocity_qpm`);

INSERT INTO `user_baselines` (`user_id`, `avg_velocity_qpm`, `typical_tables`, `typical_hours_start`, `typical_hours_end`, `sample_size_queries`)
SELECT id, 10.0, JSON_ARRAY('target_db.employees', 'target_db.customers', 'target_db.orders', 'target_db.salaries', 'target_db.payments', 'target_db.departments'), 8, 20, 250
FROM `users`
WHERE `username` IN ('admin', 'dba')
ON DUPLICATE KEY UPDATE `avg_velocity_qpm` = VALUES(`avg_velocity_qpm`);
