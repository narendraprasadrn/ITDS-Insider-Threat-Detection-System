# Insider Threat Detection System (ITDS) - Academic Prototype

A security-first database access governance and behavioral threat detection system for sensitive enterprise environments.

---

## Core Design Principles

1. **Dedicated JIT MySQL Accounts**: Every approved access request provisions an ephemeral MySQL user (`jit_<sessionId>_<rand>`) with least-privilege `GRANT`s. Dropped automatically upon expiry or manual revocation.
2. **Server-Side Auditing**: SQL telemetry is captured directly from MySQL's internal server log (`mysql.general_log` with `log_output=TABLE`), bypassing any client-side evasion.
3. **Decoupled OPA Policy Governance**: Authorization decisions are delegated to Open Policy Agent (Rego). The backend never hardcodes authorization rules and fails closed.
4. **Explainable Risk Scores**: Threat scores aggregate pure detector functions that explicitly store the rule ID, weight, evidence SQL event IDs, and clear explanation text.
5. **Standardized Architecture**: Plain ECMAScript Modules (ESM), parameterized queries, environment-driven secrets, consistent JSON responses/errors, and phased delivery.

---

## Monorepo Layout

```
Insider-vf/
├── backend/            # Express REST API (Node.js 22 ESM)
│   ├── src/
│   │   ├── config/     # Environment, logger (Pino), and DB config
│   │   ├── controllers/# Route handlers (health, etc.)
│   │   ├── db/         # MySQL2 connection pool (parameterized queries)
│   │   ├── middleware/ # Request logging, central error handler, 404
│   │   ├── routes/     # Central router and route definitions
│   │   └── services/   # Health and OPA REST client services
│   ├── .env.example
│   ├── .env
│   └── package.json
├── frontend/           # Vite + React 18 + Material UI (MUI v6)
│   ├── src/
│   │   ├── components/ # Navigation shell (Navbar, Sidebar, Layout)
│   │   ├── pages/      # System status dashboard, 404
│   │   ├── theme/      # Dark security console theme
│   │   ├── App.jsx     # Router configuration
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── policies/           # Open Policy Agent Rego policies
│   └── main.rego       # Base system policy & health
├── scripts/
│   ├── mysql-init/
│   │   ├── 01_init_schemas.sql   # Schemas itds_app, target_db & itds_admin
│   │   └── 02_seed_target_db.sql # 556 realistic organizational seed rows
│   ├── generate_seed_sql.js      # Realistic dataset generator
│   ├── start_opa.ps1             # Local OPA server startup script
│   ├── run_mysql_init.ps1        # Database initialization script
│   └── verify_phase1.js          # Automated end-to-end verification script
├── docs/
│   └── architecture.md # Architecture documentation & Mermaid diagrams
├── docker-compose.yml  # MySQL 8 + OPA server multi-container definition
├── package.json        # Monorepo workspace configuration
└── README.md
```

---

## Phase 1: Scaffold and Infrastructure

### What Was Built
- **Monorepo Structure**: Complete workspace with `/backend`, `/frontend`, `/policies`, `/scripts`, and `/docs`.
- **Docker Compose (`docker-compose.yml`)**: Multi-container definition launching:
  - MySQL 8 with flags `--log-output=TABLE --general-log=1 --default-authentication-plugin=mysql_native_password`
  - OPA (Open Policy Agent) in server mode on port `8181`, mounting `./policies`.
- **Database Initialization & Schemas (`scripts/mysql-init/`)**:
  - `01_init_schemas.sql`: Creates `itds_app` and `target_db` schemas, enables table-based general logging, and provisions `itds_admin` with `CREATE USER`, `PROCESS`, `GRANT OPTION`, and `SELECT` on `mysql.general_log`.
  - `02_seed_target_db.sql`: Populates `target_db` with **556 realistic seed rows** across 6 tables:
    - `departments` (6 rows)
    - `employees` (100 rows)
    - `salaries` (100 rows with sensitive compensation, SSN, and bank accounts)
    - `customers` (100 rows with credit limits)
    - `orders` (150 rows)
    - `payments` (100 rows)
- **Backend Architecture (`/backend`)**:
  - Node.js Express app configured as ESM (`"type": "module"`).
  - Clean modular structure: `routes/`, `controllers/`, `services/`, `middleware/`, `db/`, `config/`.
  - MySQL2 connection pool with parameterized query utilities.
  - OPA client (`opaService`) with timeouts and fail-closed default.
  - Pino logger and HTTP request logger.
  - Central error handling middleware returning consistent JSON error envelopes.
  - `/health` endpoint reporting database status, general_log status, and OPA status.
- **Frontend Architecture (`/frontend`)**:
  - Vite + React 18 + Material UI v6.
  - Custom dark cybersecurity console theme.
  - Layout shell with responsive Top Navigation bar (`Navbar`), collapsible navigation drawer (`Sidebar`), and live infrastructure health status chips.
  - System status dashboard (`DashboardPlaceholder`) displaying live connectivity to MySQL, general log row counts, and OPA server.
  - Vite reverse proxy configured for `/health` and `/api`.

---

### How to Run

#### Option A: Docker Compose (All-in-One Containerized)
If Docker and Docker Compose are installed:
```bash
# 1. Start MySQL 8 and OPA
docker compose up -d

# 2. Start Backend API
cd backend
npm install
npm run dev

# 3. Start Frontend Dashboard
cd ../frontend
npm install
npm run dev
```

#### Option B: Native Host Environment (Direct Local Services)
If running directly on the host (e.g. Windows native MySQL 8.0):
```powershell
# 1. Run database initialization and seed data
powershell -ExecutionPolicy Bypass -File .\scripts\run_mysql_init.ps1

# 2. Start local OPA Server on port 8181
.\opa.exe run --server --addr :8181 ./policies

# 3. Start Backend Express API (port 5000)
cd backend
npm install
npm run dev

# 4. Start Frontend Vite application (port 5173)
cd ../frontend
npm install
npm run dev
```

---

### How to Test and Verify

#### 1. Automated Verification Script
Run the automated Phase 1 test suite from the repository root:
```bash
node scripts/verify_phase1.js
```
Expected output:
```
====================================================
   ITDS PHASE 1 VERIFICATION & HEALTH CHECK
====================================================

✅ [1/5] Backend Health Endpoint: OK (HTTP 200)
        Status: healthy, Uptime: 738s, DB: up, OPA: up
✅ [2/5] OPA Server (port 8181): OK
        System: "Insider Threat Detection System", Version: 1.0.0
✅ [3/5] MySQL Server Configuration: OK
        general_log: ON (1), log_output: TABLE
✅ [4/5] target_db Seed Data: OK (556 total rows)
        Breakdown: {"departments":6,"employees":100,"salaries":100,"customers":100,"orders":150,"payments":100}
        Captured mysql.general_log rows: 74
✅ [5/5] Frontend Vite Application: OK (HTTP 200)

====================================================
 🎉 ALL PHASE 1 VERIFICATION CHECKS PASSED!
====================================================
```

#### 2. Manual HTTP Checks
- **Backend Health Check**:
  ```bash
  curl -s http://localhost:5000/health
  ```
  Returns `{"success": true, "data": {"status": "healthy", ...}}`

- **Central Error Format**:
  ```bash
  curl -s http://localhost:5000/invalid-route
  ```
  Returns `{"success": false, "error": {"code": "NOT_FOUND", "message": "...", "timestamp": "..."}}`

- **OPA Server REST API**:
  ```bash
  curl -s http://localhost:8181/v1/data/itds/system/health
  ```
  Returns `{"result": {"status": "ok", "system": "Insider Threat Detection System", "version": "1.0.0"}}`

- **Frontend User Interface**:
  Open [http://localhost:5173](http://localhost:5173) in your browser to view the live System Status Dashboard.

---

## Phase 2: Authentication and RBAC

### What Was Built
- **Database Schema & Seed Data (`itds_app`)** ([`scripts/mysql-init/03_init_auth_rbac.sql`](file:///D:/Insider-vf/scripts/mysql-init/03_init_auth_rbac.sql)):
  - Core security tables: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`, and `audit_log`.
  - Six organizational roles: `admin`, `security_analyst`, `dba`, `developer`, `analyst`, `hr_staff`.
  - Granular permissions: `users:manage`, `audit:read`, `profiles:manage`, `sessions:request`, `sessions:approve`, `sessions:revoke`, `threats:view`, `threats:manage`.
  - Seeded 1 active user per role with bcrypt-hashed passwords (`Password123!`):
    - `admin` (`admin@itds.internal`)
    - `security_analyst` (`sec_analyst@itds.internal`)
    - `dba` (`dba@itds.internal`)
    - `developer` (`dev@itds.internal`)
    - `analyst` (`analyst@itds.internal`)
    - `hr_staff` (`hr_staff@itds.internal`)
- **Backend Auth & RBAC Services & Endpoints**:
  - `POST /auth/login` (`POST /api/auth/login`): Validates password with `bcrypt.compare`, issues JWT access token + secure refresh token, and logs to `audit_log`.
  - `POST /auth/refresh`: Rotates refresh tokens and issues fresh access tokens.
  - `POST /auth/logout`: Revokes refresh tokens and logs logout event to `audit_log`.
  - `GET /auth/me`: Returns current user's profile, roles, and permissions.
  - `GET /auth/audit`: Paginated and filterable security audit log viewer (`admin` & `security_analyst` only).
  - User Management CRUD (`GET /api/users`, `POST /api/users`, `GET /api/users/:id`, `PUT /api/users/:id`, `DELETE /api/users/:id`): Restricted to `admin` role via `requireRole('admin')`.
  - Middleware: `authenticate()`, `requireRole(...roles)`, `requirePermission(...permissions)`.
  - Audit logging service writing all authentication successes, logouts, and login failures with IP address, user-agent, and failure reason.
- **Frontend Authentication & Protected Routes**:
  - `AuthContext`: Provides user session state, JWT storage, `login()`, `logout()`, `hasRole()`, `hasPermission()`.
  - `ProtectedRoute`: Route guard restricting unauthorized access, returning a dedicated 403 Forbidden alert with required roles when unauthorized.
  - `LoginPage`: Cybersecurity authentication console with one-click demo persona quick-select buttons for all 6 seeded roles.
  - Role-aware `Navbar`: Displays active user initials avatar, role chip, and dropdown menu with User Management and Logout actions.
  - Role-aware `Sidebar`: Dynamically highlights and filters menu options according to role privileges (e.g. User Management visible only to `admin`).
  - `UserManagement` Page: Admin-only interactive table with user creation dialog and account deactivation controls.

---

### How to Run

1. **Ensure MySQL and Backend are running**:
   ```bash
   # From backend directory
   npm run dev
   ```

2. **Run Frontend**:
   ```bash
   # From frontend directory
   npm run dev
   ```

3. **Navigate to [http://localhost:5173/login](http://localhost:5173/login)**:
   - Click any persona badge (e.g. `Admin`, `Sec Analyst`, `Developer`) to auto-fill credentials.
   - Click **Sign In** to authenticate.

---

### How to Test and Verify

#### 1. Automated Jest & Supertest Suite
Run the Phase 2 test suite:
```bash
cd backend
npm test
```

Expected output:
```
PASS tests/auth.test.js
  Phase 2 Auth & RBAC Test Suite
    POST /auth/login
      √ should successfully log in with valid credentials and return JWT tokens (274 ms)
      √ should fail with 401 when given an incorrect password (132 ms)
      √ should fail with 401 when given a non-existent username (20 ms)
    GET /auth/me
      √ should return user profile and permissions when authenticated (31 ms)
      √ should return 401 UNAUTHORIZED when no token is provided (13 ms)
    RBAC Protected Routes (User Management)
      √ should forbid non-admin user (developer) with 403 FORBIDDEN_ROLE (14 ms)
      √ should allow admin user to list all users (24 ms)
    Audit Logging
      √ should record login and failure events in audit_log table (5 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        1.628 s
Ran all test suites.
```

#### 2. Manual Verification Commands

- **Successful Login**:
  ```bash
  curl -s -X POST http://localhost:5000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"Password123!"}'
  ```
  Returns `{"success": true, "data": {"user": {"username": "admin", "roles": ["admin"]}, "accessToken": "...", "refreshToken": "..."}}`

- **Failed Login (Wrong Password)**:
  ```bash
  curl -s -X POST http://localhost:5000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"WrongPassword"}'
  ```
  Returns `{"success": false, "error": {"code": "INVALID_CREDENTIALS", "message": "Invalid username or password"}}`

- **RBAC Role Restriction (Developer denied admin route)**:
  ```bash
  # Login as developer
  DEV_TOKEN=$(curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"username":"developer","password":"Password123!"}' | jq -r .data.accessToken)
  
  # Access admin-only user management
  curl -s http://localhost:5000/api/users -H "Authorization: Bearer $DEV_TOKEN"
  ```
  Returns `403 Forbidden`: `{"success": false, "error": {"code": "FORBIDDEN_ROLE", "message": "Access denied. Requires one of roles: [admin]"}}`

- **Audit Log Verification in MySQL**:
  ```bash
  mysql -u itds_admin -pItdsAdminPass123! itds_app -e "SELECT event_type, username, status, details FROM audit_log ORDER BY id DESC LIMIT 5;"
  ```

---

## Phase 3: Resources and Reusable Access Profiles

### What Was Built
- **Database Migrations (`backend/db/migrations/004_resources_and_profiles.sql`)**:
  - `resources`: Database tables protected by ITDS with sensitivity ratings (`low`, `medium`, `high`, `critical`).
  - `access_profiles`: Reusable profiles defining permitted SQL operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DDL`), max duration (minutes), max rows hint, risk level, and `requires_approval` boolean.
  - `profile_resources`: Many-to-many profile to resource mapping.
  - `role_profiles`: Many-to-many role to profile mapping governing which employee roles may request which profiles.
  - Seeded 6 organizational tables in `target_db` (from low-sensitivity `departments` to critical-sensitivity `salaries`).
  - Seeded 6 distinct reusable access profiles:
    1. *Sales & Customer Read-Only* (Analyst, Developer, Admin | Auto-Approve | Low risk)
    2. *Support Order Processing* (Developer, Admin | Auto-Approve | Medium risk)
    3. *HR Staff Payroll & Compensation* (HR Staff, Admin | Requires Approval | Critical risk)
    4. *DBA Schema & Maintenance* (DBA, Admin | Requires Approval | DDL | High risk)
    5. *Financial Audit & Reporting* (Analyst, Security Analyst, Admin | Requires Approval | High risk)
    6. *Security Incident Investigation* (Security Analyst, Admin | Requires Approval | High risk)
- **Backend Services & Endpoints**:
  - `profileService` and `resourceService` providing full CRUD operations.
  - `GET /profiles/available` (`GET /api/profiles/available`): Evaluates authenticated user's assigned roles and returns only permitted profiles.
  - Admin CRUD endpoints: `GET/POST /api/resources`, `GET/POST/PUT/DELETE /api/profiles`.
- **Frontend Access Profiles View (`ProfilesPage.jsx`)**:
  - **Employee View**: Interactive catalog of available profiles for the user's active role with operation badges, resource list, duration badges, and approval status.
  - **Admin View**: Multi-tab management console allowing creation, editing, and resource catalog sensitivity reviews.
  - Updated `Sidebar` with live navigation to `/profiles`.

---

### How to Test and Verify

#### 1. Automated Jest Test Suite
```bash
cd backend
npm test -- tests/profiles.test.js
```

Expected output:
```
PASS tests/profiles.test.js
  Phase 3 Resources & Access Profiles Test Suite
    GET /profiles/available (Role-based profile filtering)
      √ developer sees only their permitted profiles (33 ms)
      √ hr_staff sees only HR payroll profiles (22 ms)
    Admin Access Profiles CRUD (/api/profiles)
      √ non-admin is denied access to /api/profiles with 403 (17 ms)
      √ admin can list all 6 access profiles (22 ms)
      √ admin can create a new reusable access profile (41 ms)
      √ admin can edit the created profile (35 ms)
      √ non-admin is denied when attempting to create a profile (15 ms)
      √ admin can delete the created profile (25 ms)
    Resources CRUD (/api/resources)
      √ admin can list target_db resources with sensitivity levels (18 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

#### 2. Manual CLI Verification
- **Developer Role Filtering**:
  ```bash
  # Developer token
  DEV_TOKEN=$(curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"username":"developer","password":"Password123!"}' | jq -r .data.accessToken)
  
  curl -s http://localhost:5000/profiles/available -H "Authorization: Bearer $DEV_TOKEN"
  ```
  Returns only `Sales & Customer Read-Only` and `Support Order Processing`.

- **Admin Profile Creation**:
  ```bash
  ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Password123!"}' | jq -r .data.accessToken)
  
  curl -s -X POST http://localhost:5000/api/profiles \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Audit Temp","description":"Test profile","allowed_operations":["SELECT"],"resource_ids":[1,2],"role_ids":[1]}'
  ```
  Returns `201 Created` with hydrated profile object.

---

## Phase 4: OPA / Rego Policy Engine

### What Was Built
- **Rego Policies (`/policies`)**:
  - `policies/access_request.rego`:
    - Unified access request decision: `allow`, `require_approval`, or `deny`.
    - Evaluates: user, roles, profile, resources, operations, requested duration, time of day, and sensitivity.
    - Security rules:
      - Critical/High sensitivity resources always require supervisor approval.
      - DDL operations strictly restricted to DBA or Admin roles (denied for developers/analysts).
      - Denies high/critical sensitivity requests outside business hours (08:00–18:00) unless requested by Admin.
      - Caps maximum duration by sensitivity (critical: max 60m, high: max 120m, medium: max 240m, low: max 480m).
      - Denies DELETE operations on critical payroll resources unless Admin.
  - `policies/sql_query.rego`:
    - Compliance evaluation of observed database queries against session grants.
    - Violations flagged:
      - `OPERATION_NOT_GRANTED`: Query operation not approved in session grants.
      - `TABLE_OUT_OF_SCOPE`: Query targets table outside session grant scope.
      - `SESSION_EXPIRED`: Query executed after session expiry.
      - `UNAUTHORIZED_DDL`: Schema alterations attempted without explicit DDL grant.
      - `UNBOUNDED_BULK_READ`: Full table dump `SELECT *` without LIMIT clause.
- **Rego Unit Tests (`policies/*_test.rego`)**:
  - 13 comprehensive unit tests executed via `opa test policies -v` with 100% pass rate.
- **Backend Integration**:
  - `policyService`: REST client calling OPA server (`/v1/data/itds/access/decision` and `/v1/data/itds/query/result`) with 2500ms timeout and fail-closed default.
  - Dev evaluation endpoints: `POST /api/policy/evaluate` and `GET /api/policy/status`.
- **Frontend Policy Console (`PoliciesPage.jsx`)**:
  - Interactive evaluation sandbox allowing real-time testing of Rego policies with pre-built scenario presets (Allow, Require Approval, Denied DDL, Denied Off-Hours).

---

### How to Test and Verify

#### 1. OPA Unit Test Suite
```bash
./opa.exe test policies -v
```

Expected output:
```
policies\access_request_test.rego:
data.itds.access_test.test_allow_sales_read: PASS (1.4455ms)
data.itds.access_test.test_require_approval_critical_salaries: PASS (1.0955ms)
data.itds.access_test.test_require_approval_ddl_dba: PASS (0s)
data.itds.access_test.test_deny_ddl_non_dba: PASS (1.5996ms)
data.itds.access_test.test_deny_off_hours_high_sensitivity: PASS (612.8µs)
data.itds.access_test.test_admin_override_off_hours: PASS (1.1256ms)
data.itds.access_test.test_deny_duration_cap_exceeded: PASS (1.3708ms)

policies\sql_query_test.rego:
data.itds.query_test.test_allow_valid_query: PASS (0s)
data.itds.query_test.test_violation_ungranted_operation: PASS (1.5564ms)
data.itds.query_test.test_violation_table_out_of_scope: PASS (0s)
data.itds.query_test.test_violation_unbounded_select_star: PASS (787.8µs)
data.itds.query_test.test_violation_session_expired: PASS (0s)
data.itds.query_test.test_violation_unauthorized_ddl: PASS (2.1244ms)
--------------------------------------------------------------------------------
PASS: 13/13
```

#### 2. Backend Policy Integration Tests
```bash
cd backend
npm test -- tests/policy.test.js
```

Expected output:
```
PASS tests/policy.test.js
  Phase 4 OPA Policy Engine Integration Tests
    policyService.evaluateAccessRequest
      √ should return action: allow for standard read request within business hours (29 ms)
      √ should return action: require_approval for critical resources (salaries) (9 ms)
      √ should return action: deny for DDL requested by non-DBA (7 ms)
      √ should return action: deny for high-sensitivity off-hours request by non-admin (7 ms)
    policyService.evaluateSqlQuery
      √ should allow query matching session grants (13 ms)
      √ should flag OPERATION_NOT_GRANTED when operation is ungranted (7 ms)
      √ should flag TABLE_OUT_OF_SCOPE when query accesses unauthorized table (6 ms)
    POST /api/policy/evaluate (Dev endpoint)
      √ should return 200 and evaluation result for access_request (26 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

---

## Phase 5: JIT Sessions and MySQL User Provisioning

### What Was Built
- **Database Migrations (`backend/db/migrations/005_jit_sessions.sql`)**:
  - `access_requests`: Captures requests, requested duration, business justification, status (`pending`, `approved`, `denied`, `expired`), and OPA decision reasoning.
  - `approvals`: Audit history of manual supervisor/admin decisions.
  - `db_sessions`: Tracks active sessions, start/end timestamps, ephemeral MySQL username (`jit_<requestId>_<rand>`), and JSON granted operations & resources.
- **Dynamic MySQL Least-Privilege Provisioning Engine (`sessionService`)**:
  - Automatically provisions dedicated MySQL user `jit_<requestId>_<rand>` with secure random password.
  - Generates strictly scoped table-level `GRANT`s matching only the profile's allowed operations and resources.
  - Issues connection credentials (`host`, `port`, `database`, `username`, `password`, `expiresAt`) returned ONCE to the employee.
- **Background Expiry & Teardown Worker (`expiry.worker.js`)**:
  - Scheduled via `node-cron` running every 30 seconds (`*/30 * * * * *`).
  - Scans for expired sessions (`end_time <= NOW()`), terminates active client connections (`KILL <threadId>`), and drops the MySQL user (`DROP USER`).
  - Provides instant manual revocation by administrator (`POST /api/sessions/:id/revoke`).
- **Access Request Endpoints**:
  - `POST /access-requests`: Evaluates requested profile against OPA (`access_request.rego`). Auto-approves and provisions user if allowed, routes to pending queue if required, or denies.
  - `GET /access-requests/pending`: Approval queue for administrators.
  - `POST /access-requests/:id/approve` & `POST /access-requests/:id/deny`: Manual supervisor review.
  - `GET /sessions/my`: Employee active/past sessions with expiry timestamps.
  - `GET /sessions/active` & `POST /sessions/:id/revoke`: Admin global session monitoring and force revocation.
- **Frontend JIT Sessions UI (`SessionsPage.jsx`)**:
  - Interactive "Request Access" modal with profile selection and duration slider.
  - **One-Time Credentials Modal**: Copyable host, port, db, ephemeral username, and revealed/hidden password for DBeaver/Workbench.
  - "My Sessions" tab with countdown timer.
  - "Pending Approvals Queue" tab with Approve/Deny buttons and administrator review notes.
  - "Active Global Sessions" tab with immediate Revoke button.

---

### How to Test and Verify

#### 1. Automated Integration Tests
```bash
cd backend
npm test -- tests/sessions.test.js
```

Expected output:
```
PASS tests/sessions.test.js
  Phase 5 JIT Sessions & MySQL User Provisioning Tests
    Auto-Approval JIT Flow (Sales Read-Only)
      √ developer submits request for auto-approve profile -> receives JIT MySQL credentials (129 ms)
      √ ephemeral JIT user can execute allowed SELECT on granted table (26 ms)
      √ ephemeral JIT user is DENIED access to ungranted table (salaries) (8 ms)
      √ ephemeral JIT user is DENIED ungranted operation (DELETE on customers) (7 ms)
    Approval Queue Flow (HR Staff Payroll & Compensation)
      √ hr_staff submits request for critical profile -> routed to pending queue by OPA (38 ms)
      √ admin views pending requests queue (15 ms)
      √ admin approves pending request -> temporary MySQL user is created (107 ms)
    Session Revocation & Connection Teardown
      √ admin force-revokes an active session -> drops user from MySQL (50 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

#### 2. Manual CLI Connection with Temporary Credentials
- **Querying Granted Table**:
  ```bash
  mysql -u jit_9_56041b -p"JitY6vJ*JIhu0QPhkqC9!" target_db -e "SELECT customer_code, company_name FROM customers LIMIT 2;"
  ```
  Returns `CUST2001 Lopez Logistics`, `CUST2002 Thomas Solutions`.

- **Querying Ungranted Table (Blocked by MySQL Grant)**:
  ```bash
  mysql -u jit_9_56041b -p"JitY6vJ*JIhu0QPhkqC9!" target_db -e "SELECT * FROM salaries LIMIT 1;"
  ```
  Returns `ERROR 1142 (42000): SELECT command denied to user 'jit_9_56041b'@'localhost' for table 'salaries'`.

- **Executing Ungranted Operation (Blocked by MySQL Grant)**:
  ```bash
  mysql -u jit_9_56041b -p"JitY6vJ*JIhu0QPhkqC9!" target_db -e "DELETE FROM customers WHERE customer_id = 1;"
  ```
  Returns `ERROR 1142 (42000): DELETE command denied to user 'jit_9_56041b'@'localhost' for table 'customers'`.

- **After Expiry or Revoke**:
  ```bash
  mysql -u jit_9_56041b -p"JitY6vJ*JIhu0QPhkqC9!" target_db -e "SELECT 1;"
  ```
  Returns `ERROR 1045 (28000): Access denied for user 'jit_9_56041b'@'localhost'`.

---

## Roadmap

- [x] **Phase 1: Scaffold and infrastructure** (Completed)
- [x] **Phase 2: Authentication and RBAC** (Completed)
- [x] **Phase 3: Resources and reusable access profiles** (Completed)
- [x] **Phase 4: OPA/Rego policy engine integration** (Completed)
- [x] **Phase 5: JIT sessions and MySQL user provisioning** (Completed)
- [ ] **Phase 6: SQL activity ingestion**
- [ ] **Phase 7: Policy evaluation of observed queries**
- [ ] **Phase 8: Threat detection engine and risk scoring**
- [ ] **Phase 9: Real-time pipeline and admin dashboard**
- [ ] **Phase 10: Attack simulation, testing, and demo hardening**
