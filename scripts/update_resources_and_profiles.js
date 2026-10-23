// scripts/update_resources_and_profiles.js
import mysql from '../backend/node_modules/mysql2/promise.js';

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'itds_admin',
    password: 'ItdsAdminPass123!',
    database: 'itds_app',
    multipleStatements: true
  });

  console.log('Connected to itds_app.');

  await conn.query('SET FOREIGN_KEY_CHECKS = 0;');

  await conn.query('TRUNCATE TABLE `profile_resources`;');
  await conn.query('TRUNCATE TABLE `role_profiles`;');
  await conn.query('TRUNCATE TABLE `access_profiles`;');
  await conn.query('TRUNCATE TABLE `resources`;');

  // 1. Resources (10 Business Tables of FinanceCorpDB)
  await conn.query(`
    INSERT INTO \`resources\` (\`id\`, \`db_name\`, \`table_name\`, \`sensitivity\`, \`description\`) VALUES
    (1, 'FinanceCorpDB', 'Employees', 'medium', 'Enterprise personnel roster, organizational hierarchy, and job titles'),
    (2, 'FinanceCorpDB', 'Customers', 'medium', 'Customer contact records, categorization, and commercial credit limits'),
    (3, 'FinanceCorpDB', 'Transactions', 'high', 'Customer financial payments, wire transfers, ACH settlements, and transaction ledgers'),
    (4, 'FinanceCorpDB', 'Products', 'low', 'Catalog of security software products, hardware appliances, and pricing'),
    (5, 'FinanceCorpDB', 'Orders', 'medium', 'Customer sales orders, fulfillment tracking, and total invoice amounts'),
    (6, 'FinanceCorpDB', 'Payroll', 'critical', 'Confidential employee salaries, bonuses, and banking payment disbursement details'),
    (7, 'FinanceCorpDB', 'VendorContracts', 'medium', 'Third-party vendor service agreements, procurement scopes, and contract values'),
    (8, 'FinanceCorpDB', 'BudgetReports', 'high', 'Departmental budget allocations, actual expenditures, and quarterly variances'),
    (9, 'FinanceCorpDB', 'TaxRecords', 'critical', 'Corporate and individual tax filings, taxable income, and regulatory tax assessments'),
    (10, 'FinanceCorpDB', 'SecurityAuditLogs', 'critical', 'Internal security audit events, authorization decisions, and access telemetry');
  `);

  // 2. Reusable Access Profiles
  await conn.query(`
    INSERT INTO \`access_profiles\` (\`id\`, \`name\`, \`description\`, \`allowed_operations\`, \`max_duration_minutes\`, \`max_rows_hint\`, \`risk_level\`, \`requires_approval\`) VALUES
    (1, 'Developer Read Profile', 'Approved read-only access to products, customers, and orders for routine application development', '["SELECT"]', 120, 500, 'low', FALSE),
    (2, 'Developer Work Profile', 'Approved read and write operations on designated application development tables', '["SELECT", "INSERT", "UPDATE"]', 60, 200, 'medium', FALSE),
    (3, 'DBA Operations Profile', 'Operational database monitoring and routine data maintenance across operational tables', '["SELECT", "INSERT", "UPDATE"]', 120, 2000, 'high', FALSE),
    (4, 'DBA Maintenance Profile', 'Full administrative database access including DDL schema alterations and table maintenance', '["SELECT", "INSERT", "UPDATE", "DELETE", "DDL"]', 60, 5000, 'high', TRUE),
    (5, 'Executive Payroll & Compensation', 'Highly sensitive read access to employee records, compensation ledgers, and tax filings', '["SELECT"]', 45, 100, 'critical', TRUE),
    (6, 'Financial Audit & Tax Reporting', 'Financial reconciliation of corporate transactions, orders, vendor contracts, and tax filings', '["SELECT"]', 90, 1000, 'high', TRUE),
    (7, 'Admin Security Administration', 'Complete authorized security administration across all ten business tables and audit logs', '["SELECT", "INSERT", "UPDATE", "DELETE"]', 60, 5000, 'critical', FALSE);
  `);

  // 3. Profile Resources Mapping
  await conn.query(`
    -- 1. Developer Read: Products (4), Customers (2), Orders (5)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (1, 4), (1, 2), (1, 5);

    -- 2. Developer Work: Products (4), Orders (5)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (2, 4), (2, 5);

    -- 3. DBA Operations: Employees (1), Customers (2), Transactions (3), Products (4), Orders (5), VendorContracts (7), BudgetReports (8)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 7), (3, 8);

    -- 4. DBA Maintenance: All 10 tables (1..10)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (4, 7), (4, 8), (4, 9), (4, 10);

    -- 5. Executive Payroll: Employees (1), Payroll (6), TaxRecords (9)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (5, 1), (5, 6), (5, 9);

    -- 6. Financial Audit: Transactions (3), Orders (5), BudgetReports (8), TaxRecords (9), VendorContracts (7)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (6, 3), (6, 5), (6, 7), (6, 8), (6, 9);

    -- 7. Admin Security Administration: All 10 tables (1..10)
    INSERT INTO \`profile_resources\` (\`profile_id\`, \`resource_id\`) VALUES
    (7, 1), (7, 2), (7, 3), (7, 4), (7, 5), (7, 6), (7, 7), (7, 8), (7, 9), (7, 10);
  `);

  // 4. Role-Profiles Mapping (Roles: 1: admin, 2: dba, 3: developer)
  await conn.query(`
    -- Admin has access to all profiles
    INSERT INTO \`role_profiles\` (\`role_id\`, \`profile_id\`) VALUES
    (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7);

    -- DBA has Developer Read, DBA Operations, DBA Maintenance, Financial Audit
    INSERT INTO \`role_profiles\` (\`role_id\`, \`profile_id\`) VALUES
    (2, 1), (2, 3), (2, 4), (2, 6);

    -- Developer has Developer Read (auto), Developer Work (auto), Executive Payroll (requires approval)
    INSERT INTO \`role_profiles\` (\`role_id\`, \`profile_id\`) VALUES
    (3, 1), (3, 2), (3, 5);
  `);

  // 5. Update user_baselines for the 3 demo personas on FinanceCorpDB
  await conn.query(`
    UPDATE \`user_baselines\`
    SET \`typical_tables\` = JSON_ARRAY('FinanceCorpDB.Products', 'FinanceCorpDB.Orders', 'FinanceCorpDB.Customers')
    WHERE \`user_id\` = 3;

    UPDATE \`user_baselines\`
    SET \`typical_tables\` = JSON_ARRAY('FinanceCorpDB.Employees', 'FinanceCorpDB.Customers', 'FinanceCorpDB.Transactions', 'FinanceCorpDB.Products', 'FinanceCorpDB.Orders', 'FinanceCorpDB.VendorContracts', 'FinanceCorpDB.BudgetReports')
    WHERE \`user_id\` IN (1, 2);
  `);

  await conn.query('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('Successfully updated resources, reusable profiles, role mappings, and baselines for FinanceCorpDB.');
  await conn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
