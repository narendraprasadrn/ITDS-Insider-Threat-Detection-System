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

## Roadmap

- [x] **Phase 1: Scaffold and infrastructure** (Completed)
- [ ] **Phase 2: Authentication and RBAC**
- [ ] **Phase 3: Resources and reusable access profiles**
- [ ] **Phase 4: OPA/Rego policy engine integration**
- [ ] **Phase 5: JIT sessions and MySQL user provisioning**
- [ ] **Phase 6: SQL activity ingestion**
- [ ] **Phase 7: Policy evaluation of observed queries**
- [ ] **Phase 8: Threat detection engine and risk scoring**
- [ ] **Phase 9: Real-time pipeline and admin dashboard**
- [ ] **Phase 10: Attack simulation, testing, and demo hardening**
