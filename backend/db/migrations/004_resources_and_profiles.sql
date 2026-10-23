-- 004_resources_and_profiles.sql
-- Phase 3: Resources and Reusable Access Profiles schema & initial seeds

USE `itds_app`;

DROP TABLE IF EXISTS `role_profiles`;
DROP TABLE IF EXISTS `profile_resources`;
DROP TABLE IF EXISTS `access_profiles`;
DROP TABLE IF EXISTS `resources`;

-- 1. Resources table (database tables protected by ITDS)
CREATE TABLE `resources` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `db_name` VARCHAR(60) NOT NULL,
  `table_name` VARCHAR(60) NOT NULL,
  `sensitivity` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_db_table` (`db_name`, `table_name`)
) ENGINE=InnoDB;

-- 2. Access Profiles table
CREATE TABLE `access_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT NOT NULL,
  `allowed_operations` JSON NOT NULL, -- e.g. ["SELECT"], ["SELECT", "INSERT"]
  `max_duration_minutes` INT NOT NULL DEFAULT 60,
  `max_rows_hint` INT DEFAULT 1000,
  `risk_level` ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
  `requires_approval` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Mapping: Profile to Resources
CREATE TABLE `profile_resources` (
  `profile_id` INT NOT NULL,
  `resource_id` INT NOT NULL,
  PRIMARY KEY (`profile_id`, `resource_id`),
  CONSTRAINT `fk_pr_profile` FOREIGN KEY (`profile_id`) REFERENCES `access_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Mapping: Role to Profiles (which roles may request which profiles)
CREATE TABLE `role_profiles` (
  `role_id` INT NOT NULL,
  `profile_id` INT NOT NULL,
  PRIMARY KEY (`role_id`, `profile_id`),
  CONSTRAINT `fk_rp2_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp2_profile` FOREIGN KEY (`profile_id`) REFERENCES `access_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================
-- SEED DATA
-- ==========================================

-- Seed Resources from target_db
INSERT INTO `resources` (`id`, `db_name`, `table_name`, `sensitivity`, `description`) VALUES
(1, 'target_db', 'departments', 'low', 'Company organizational divisions and department structures'),
(2, 'target_db', 'customers', 'medium', 'Customer contact lists and credit limits'),
(3, 'target_db', 'orders', 'medium', 'Customer transaction records and order fulfillment'),
(4, 'target_db', 'payments', 'high', 'Financial payments, transaction methods, and settlement references'),
(5, 'target_db', 'employees', 'medium', 'Employee roster, job titles, and contact information'),
(6, 'target_db', 'salaries', 'critical', 'Confidential employee salaries, bank accounts, and SSN/tax IDs');

-- Seed 6 Reusable Access Profiles
INSERT INTO `access_profiles` (`id`, `name`, `description`, `allowed_operations`, `max_duration_minutes`, `max_rows_hint`, `risk_level`, `requires_approval`) VALUES
(1, 'Sales & Customer Read-Only', 'Read-only access to customer accounts and orders for business reporting', '["SELECT"]', 120, 500, 'low', FALSE),
(2, 'Support Order Processing', 'Read and write access to customers and orders for handling support tickets', '["SELECT", "INSERT", "UPDATE"]', 60, 200, 'medium', FALSE),
(3, 'HR Staff Payroll & Compensation', 'Highly sensitive read access to employee records, compensation, and salary ledgers', '["SELECT"]', 45, 100, 'critical', TRUE),
(4, 'DBA Schema & Maintenance', 'Full administrative database access including DDL schema alterations', '["SELECT", "INSERT", "UPDATE", "DELETE", "DDL"]', 60, 5000, 'high', TRUE),
(5, 'Financial Audit & Reporting', 'Financial reconciliation of revenue, payment ledger, and orders', '["SELECT"]', 90, 1000, 'high', TRUE),
(6, 'Security Incident Investigation', 'Incident forensics across all database tables for security analysts', '["SELECT"]', 30, 2000, 'high', TRUE);

-- Profile Resources Mapping
-- 1. Sales & Customer: customers (2), orders (3)
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
(1, 2), (1, 3);

-- 2. Support Order Processing: customers (2), orders (3), payments (4)
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
(2, 2), (2, 3), (2, 4);

-- 3. HR Payroll: employees (5), salaries (6), departments (1)
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
(3, 1), (3, 5), (3, 6);

-- 4. DBA Maintenance: all tables (1-6)
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6);

-- 5. Financial Audit: orders (3), payments (4), departments (1)
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
(5, 1), (5, 3), (5, 4);

-- 6. Security Investigation: all tables (1-6)
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
(6, 1), (6, 2), (6, 3), (6, 4), (6, 5), (6, 6);

-- Role-Profiles Mapping (Roles: 1:admin, 2:dba, 3:developer)
INSERT INTO `role_profiles` (`role_id`, `profile_id`) VALUES
-- Admin may request any profile
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6),
-- DBA: DBA Maintenance (4), Financial Audit (5), Sales & Customer Read-Only (1)
(2, 1), (2, 4), (2, 5),
-- Developer: Sales Read-Only (1), Support Order Processing (2), HR Payroll & Compensation (3)
(3, 1), (3, 2), (3, 3);
