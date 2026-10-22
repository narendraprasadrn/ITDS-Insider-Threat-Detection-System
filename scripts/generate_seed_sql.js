// scripts/generate_seed_sql.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Dorothy', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Edward', 'Deborah'];

const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'];

const departments = [
  { id: 1, name: 'Engineering', building: 'Building A', budget: 2500000.00 },
  { id: 2, name: 'Human Resources', building: 'Building B', budget: 800000.00 },
  { id: 3, name: 'Finance & Accounting', building: 'Building B', budget: 1200000.00 },
  { id: 4, name: 'Sales & Marketing', building: 'Building C', budget: 3000000.00 },
  { id: 5, name: 'Legal & Compliance', building: 'Building D', budget: 950000.00 },
  { id: 6, name: 'Customer Support', building: 'Building C', budget: 650000.00 }
];

const jobTitles = {
  1: ['Software Engineer', 'Senior Architect', 'DevOps Specialist', 'QA Engineer', 'Tech Lead', 'Security Analyst'],
  2: ['HR Generalist', 'Recruiter', 'Payroll Specialist', 'HR Director', 'People Ops Coordinator'],
  3: ['Financial Analyst', 'Senior Accountant', 'Billing Specialist', 'Finance Director', 'Tax Auditor'],
  4: ['Account Executive', 'Sales Lead', 'Marketing Specialist', 'Growth Analyst', 'VP Sales'],
  5: ['Compliance Officer', 'Legal Counsel', 'Data Protection Lead'],
  6: ['Support Specialist', 'Support Tier 2', 'Support Manager']
};

const cities = ['New York', 'San Francisco', 'Chicago', 'Austin', 'Seattle', 'Boston', 'Denver', 'Atlanta', 'Los Angeles', 'Dallas'];
const countries = ['USA', 'Canada', 'UK', 'Germany', 'Australia'];
const orderStatuses = ['completed', 'pending', 'processing', 'shipped', 'cancelled'];
const paymentMethods = ['credit_card', 'bank_transfer', 'ach', 'wire', 'paypal'];
const paymentStatuses = ['settled', 'completed', 'pending', 'failed'];

let sql = `-- 02_seed_target_db.sql
-- Realistic organizational database for target_db (approx ~550 rows)

USE \`target_db\`;

DROP TABLE IF EXISTS \`payments\`;
DROP TABLE IF EXISTS \`orders\`;
DROP TABLE IF EXISTS \`customers\`;
DROP TABLE IF EXISTS \`salaries\`;
DROP TABLE IF EXISTS \`employees\`;
DROP TABLE IF EXISTS \`departments\`;

CREATE TABLE \`departments\` (
  \`department_id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`name\` VARCHAR(100) NOT NULL UNIQUE,
  \`building\` VARCHAR(50) NOT NULL,
  \`budget\` DECIMAL(12, 2) NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE \`employees\` (
  \`employee_id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`employee_code\` VARCHAR(20) NOT NULL UNIQUE,
  \`first_name\` VARCHAR(50) NOT NULL,
  \`last_name\` VARCHAR(50) NOT NULL,
  \`email\` VARCHAR(100) NOT NULL UNIQUE,
  \`department_id\` INT NOT NULL,
  \`job_title\` VARCHAR(80) NOT NULL,
  \`hire_date\` DATE NOT NULL,
  \`status\` ENUM('active', 'on_leave', 'terminated') DEFAULT 'active',
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`fk_emp_dept\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\` (\`department_id\`)
) ENGINE=InnoDB;

CREATE TABLE \`salaries\` (
  \`salary_id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`employee_id\` INT NOT NULL,
  \`base_salary\` DECIMAL(10, 2) NOT NULL,
  \`bonus\` DECIMAL(10, 2) DEFAULT 0.00,
  \`effective_date\` DATE NOT NULL,
  \`bank_account\` VARCHAR(34) NOT NULL,
  \`ssn_tax_id\` VARCHAR(20) NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`fk_salary_emp\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\` (\`employee_id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE \`customers\` (
  \`customer_id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`customer_code\` VARCHAR(20) NOT NULL UNIQUE,
  \`company_name\` VARCHAR(120) NOT NULL,
  \`contact_name\` VARCHAR(80) NOT NULL,
  \`email\` VARCHAR(100) NOT NULL UNIQUE,
  \`phone\` VARCHAR(30) NOT NULL,
  \`credit_limit\` DECIMAL(12, 2) NOT NULL,
  \`city\` VARCHAR(60) NOT NULL,
  \`country\` VARCHAR(60) NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE \`orders\` (
  \`order_id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`order_number\` VARCHAR(30) NOT NULL UNIQUE,
  \`customer_id\` INT NOT NULL,
  \`order_date\` DATE NOT NULL,
  \`total_amount\` DECIMAL(12, 2) NOT NULL,
  \`status\` ENUM('pending', 'processing', 'shipped', 'completed', 'cancelled') DEFAULT 'pending',
  \`shipping_address\` TEXT NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`fk_order_cust\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`customer_id\`)
) ENGINE=InnoDB;

CREATE TABLE \`payments\` (
  \`payment_id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`payment_ref\` VARCHAR(40) NOT NULL UNIQUE,
  \`order_id\` INT NOT NULL,
  \`customer_id\` INT NOT NULL,
  \`payment_date\` DATE NOT NULL,
  \`amount\` DECIMAL(12, 2) NOT NULL,
  \`payment_method\` ENUM('credit_card', 'bank_transfer', 'ach', 'wire', 'paypal') NOT NULL,
  \`status\` ENUM('settled', 'completed', 'pending', 'failed') DEFAULT 'completed',
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`fk_payment_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`order_id\`),
  CONSTRAINT \`fk_payment_cust\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`customer_id\`)
) ENGINE=InnoDB;

-- 1. Departments Seed (6 rows)
INSERT INTO \`departments\` (\`department_id\`, \`name\`, \`building\`, \`budget\`) VALUES
${departments.map(d => `(${d.id}, '${d.name}', '${d.building}', ${d.budget})`).join(',\n')};

`;

// 2. Employees Seed (100 rows)
sql += `-- 2. Employees Seed (100 rows)\nINSERT INTO \`employees\` (\`employee_id\`, \`employee_code\`, \`first_name\`, \`last_name\`, \`email\`, \`department_id\`, \`job_title\`, \`hire_date\`, \`status\`) VALUES\n`;
const empValues = [];
for (let i = 1; i <= 100; i++) {
  const fn = firstNames[(i * 3 + 7) % firstNames.length];
  const ln = lastNames[(i * 5 + 11) % lastNames.length];
  const deptId = (i % 6) + 1;
  const deptTitles = jobTitles[deptId];
  const title = deptTitles[i % deptTitles.length];
  const code = `EMP${String(1000 + i)}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@corporate-target.internal`;
  const hireYear = 2018 + (i % 7);
  const hireMonth = String((i % 12) + 1).padStart(2, '0');
  const hireDay = String((i % 28) + 1).padStart(2, '0');
  const hireDate = `${hireYear}-${hireMonth}-${hireDay}`;
  const status = i % 25 === 0 ? 'terminated' : (i % 15 === 0 ? 'on_leave' : 'active');
  empValues.push(`(${i}, '${code}', '${fn}', '${ln}', '${email}', ${deptId}, '${title}', '${hireDate}', '${status}')`);
}
sql += empValues.join(',\n') + ';\n\n';

// 3. Salaries Seed (100 rows, 1 per employee)
sql += `-- 3. Salaries Seed (100 rows)\nINSERT INTO \`salaries\` (\`salary_id\`, \`employee_id\`, \`base_salary\`, \`bonus\`, \`effective_date\`, \`bank_account\`, \`ssn_tax_id\`) VALUES\n`;
const salaryValues = [];
for (let i = 1; i <= 100; i++) {
  const base = 55000 + ((i * 1370) % 95000);
  const bonus = (i % 3 === 0) ? (base * 0.12).toFixed(2) : (base * 0.05).toFixed(2);
  const effectiveDate = `2024-01-01`;
  const account = `US${String(100000000000 + i * 8374619).padStart(18, '0')}`;
  const ssn = `${String(100 + (i * 7) % 800)}-${String(10 + (i * 3) % 89)}-${String(1000 + (i * 17) % 8999)}`;
  salaryValues.push(`(${i}, ${i}, ${base.toFixed(2)}, ${bonus}, '${effectiveDate}', '${account}', '${ssn}')`);
}
sql += salaryValues.join(',\n') + ';\n\n';

// 4. Customers Seed (100 rows)
sql += `-- 4. Customers Seed (100 rows)\nINSERT INTO \`customers\` (\`customer_id\`, \`customer_code\`, \`company_name\`, \`contact_name\`, \`email\`, \`phone\`, \`credit_limit\`, \`city\`, \`country\`) VALUES\n`;
const customerValues = [];
const compSuffixes = ['Technologies', 'Logistics', 'Solutions', 'Holdings', 'Industries', 'Enterprises', 'Ventures', 'Global'];
for (let i = 1; i <= 100; i++) {
  const code = `CUST${String(2000 + i)}`;
  const fn = firstNames[(i * 2 + 3) % firstNames.length];
  const ln = lastNames[(i * 4 + 7) % lastNames.length];
  const comp = `${ln} ${compSuffixes[i % compSuffixes.length]}`;
  const email = `contact@${comp.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  const phone = `+1-555-${String(100 + i).padStart(3, '0')}-${String(1000 + i * 9).slice(0, 4)}`;
  const limit = (10000 + (i * 4500) % 250000).toFixed(2);
  const city = cities[i % cities.length];
  const country = countries[i % countries.length];
  customerValues.push(`(${i}, '${code}', '${comp}', '${fn} ${ln}', '${email}', '${phone}', ${limit}, '${city}', '${country}')`);
}
sql += customerValues.join(',\n') + ';\n\n';

// 5. Orders Seed (150 rows)
sql += `-- 5. Orders Seed (150 rows)\nINSERT INTO \`orders\` (\`order_id\`, \`order_number\`, \`customer_id\`, \`order_date\`, \`total_amount\`, \`status\`, \`shipping_address\`) VALUES\n`;
const orderValues = [];
for (let i = 1; i <= 150; i++) {
  const num = `ORD-2024-${String(5000 + i)}`;
  const custId = (i % 100) + 1;
  const month = String((i % 12) + 1).padStart(2, '0');
  const day = String((i % 28) + 1).padStart(2, '0');
  const date = `2024-${month}-${day}`;
  const total = (500 + (i * 321.45) % 18000).toFixed(2);
  const status = orderStatuses[i % orderStatuses.length];
  const addr = `${100 + i} Enterprise Way, Suite ${i % 20 + 1}, Metro District`;
  orderValues.push(`(${i}, '${num}', ${custId}, '${date}', ${total}, '${status}', '${addr}')`);
}
sql += orderValues.join(',\n') + ';\n\n';

// 6. Payments Seed (100 rows)
sql += `-- 6. Payments Seed (100 rows)\nINSERT INTO \`payments\` (\`payment_id\`, \`payment_ref\`, \`order_id\`, \`customer_id\`, \`payment_date\`, \`amount\`, \`payment_method\`, \`status\`) VALUES\n`;
const paymentValues = [];
for (let i = 1; i <= 100; i++) {
  const ref = `PAY-TXN-${String(90000 + i)}`;
  const orderId = i;
  const custId = (i % 100) + 1;
  const month = String((i % 12) + 1).padStart(2, '0');
  const day = String((i % 28) + 1).padStart(2, '0');
  const date = `2024-${month}-${day}`;
  const amount = (400 + (i * 290.15) % 15000).toFixed(2);
  const method = paymentMethods[i % paymentMethods.length];
  const status = paymentStatuses[i % paymentStatuses.length];
  paymentValues.push(`(${i}, '${ref}', ${orderId}, ${custId}, '${date}', ${amount}, '${method}', '${status}')`);
}
sql += paymentValues.join(',\n') + ';\n';

const outPath = path.join(__dirname, 'mysql-init', '02_seed_target_db.sql');
fs.writeFileSync(outPath, sql);
console.log(`Successfully generated ${outPath} with ~506 rows across 6 tables.`);
