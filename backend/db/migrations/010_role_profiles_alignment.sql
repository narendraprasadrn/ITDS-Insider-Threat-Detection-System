-- Migration: 010_role_profiles_alignment.sql
-- Purpose: Align role-profile mappings so Admin and DBA receive role-appropriate profiles,
-- preventing inadvertent fallback to Developer Read Profile.

USE `itds_app`;

DELETE FROM `role_profiles`;

INSERT INTO `role_profiles` (`role_id`, `profile_id`) VALUES
-- Admin: Admin Security Administration (7, priority), DBA Operations (3), DBA Maintenance (4)
(1, 7),
(1, 3),
(1, 4),

-- DBA: DBA Operations Profile (3, priority routine), DBA Maintenance (4), Financial Audit (6)
(2, 3),
(2, 4),
(2, 6),

-- Developer: Developer Read Profile (1, priority routine), Developer Work Profile (2), Executive Payroll (5)
(3, 1),
(3, 2),
(3, 5);
