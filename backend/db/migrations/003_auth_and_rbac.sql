-- 03_init_auth_rbac.sql
-- Schema and initial seed for itds_app: Users, Roles, Permissions, User Roles, and Audit Log

USE `itds_app`;

DROP TABLE IF EXISTS `audit_log`;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `user_roles`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `roles`;
DROP TABLE IF EXISTS `users`;

-- 1. Roles table
CREATE TABLE `roles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `description` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Permissions table
CREATE TABLE `permissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(80) NOT NULL UNIQUE,
  `description` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Role-Permissions mapping
CREATE TABLE `role_permissions` (
  `role_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Users table
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(60) NOT NULL UNIQUE,
  `email` VARCHAR(120) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. User-Roles mapping
CREATE TABLE `user_roles` (
  `user_id` INT NOT NULL,
  `role_id` INT NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. Refresh tokens table for JWT rotation
CREATE TABLE `refresh_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. Audit log table
CREATE TABLE `audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_type` VARCHAR(60) NOT NULL,
  `user_id` INT NULL,
  `username` VARCHAR(60) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `status` ENUM('SUCCESS', 'FAILURE', 'WARNING') NOT NULL,
  `details` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_event` (`event_type`),
  INDEX `idx_audit_time` (`created_at`)
) ENGINE=InnoDB;

-- SEED DATA

-- Roles (admin, dba, developer)
INSERT INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'admin', 'Full system administrator with user and policy management'),
(2, 'dba', 'Database administrator authorized for maintenance, DDL, and audit monitoring'),
(3, 'developer', 'Application engineer requiring JIT database access');

-- Permissions
INSERT INTO `permissions` (`id`, `name`, `description`) VALUES
(1, 'users:manage', 'Create, update, and manage application users and roles'),
(2, 'audit:read', 'View authentication and security audit logs'),
(3, 'profiles:manage', 'Configure database access profiles and resources'),
(4, 'sessions:request', 'Request Just-In-Time database access sessions'),
(5, 'sessions:approve', 'Approve or deny employee JIT access requests'),
(6, 'sessions:revoke', 'Force revoke active database sessions'),
(7, 'threats:view', 'View threat detector scores, violations, and telemetry'),
(8, 'threats:manage', 'Investigate and update alert statuses');

-- Role-Permissions
-- Admin has all permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
-- DBA has audit, profile management, session approve/revoke, and threat viewing
(2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7), (2, 8),
-- Developer has session request
(3, 4);

-- Seed Users with bcrypt hash of 'Password123!'
-- Hash: $2b$10$IsbCs9eBflog87jBsaQbNeKtAKExZwkYHu.93qJxc5jyuI8FC1BxC
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `is_active`) VALUES
(1, 'admin', 'admin@itds.internal', '$2b$10$IsbCs9eBflog87jBsaQbNeKtAKExZwkYHu.93qJxc5jyuI8FC1BxC', 'System Administrator', TRUE),
(2, 'dba', 'dba@itds.internal', '$2b$10$IsbCs9eBflog87jBsaQbNeKtAKExZwkYHu.93qJxc5jyuI8FC1BxC', 'Dan Database', TRUE),
(3, 'developer', 'dev@itds.internal', '$2b$10$IsbCs9eBflog87jBsaQbNeKtAKExZwkYHu.93qJxc5jyuI8FC1BxC', 'Dave Developer', TRUE);

-- User-Roles mapping (1 per role)
INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
(1, 1), -- admin -> admin
(2, 2), -- dba -> dba
(3, 3); -- developer -> developer
