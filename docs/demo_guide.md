# Insider Threat Detection System (ITDS) - Interactive Demo Guide

This guide is designed for evaluators, instructors, and judges to run a complete live demonstration of the Insider Threat Detection System.

---

## 1. Prerequisites & Clean State Initialization

### 1.1 Start Infrastructure Services
Ensure MySQL 8 (port 3306) and OPA (port 8181) are running:
```powershell
# Start OPA server in terminal 1 (or run via background process)
.\opa.exe run --server --addr :8181 ./policies
```

### 1.2 Start Backend and Frontend Applications
```powershell
# Terminal 2: Start Node.js Backend API (port 5000)
npm run dev:backend

# Terminal 3: Start Vite + React Frontend Console (port 5173)
npm run dev:frontend
```

### 1.3 Clean State Reset
Before presenting, run the automated reset script to clean up leftover temporary accounts and restore pristine demo baselines:
```bash
npm run demo:reset
```
*Expected Output: Confirms purge of temporary `jit_*` accounts, truncation of telemetry tables, and re-synchronization of user behavioral baselines.*

---

## 2. Walkthrough: Live Demo Flow

### Step 1: Access the Security Operations Console
1. Open Google Chrome or your browser at: **`http://localhost:5173`**
2. Log in using the **Security Administrator** account:
   - **Username:** `admin`
   - **Password:** `Password123!`
3. Navigate to the **Live Dashboard**:
   - Notice the Top Metrics Bar: Active JIT Sessions (0), Queries/Min (0), Open Alerts (0).
   - Notice the Monitored Active Sessions table (empty).
   - Notice the Live Server-Side SQL Feed streaming terminal waiting for activity.

---

### Step 2: Request & Provision JIT Access (Developer Flow)
1. In a second browser incognito window (or secondary tab), navigate to `http://localhost:5173` and log in as:
   - **Username:** `developer`
   - **Password:** `Password123!`
2. Navigate to **Access Profiles** / **Request Access**:
   - Select **Sales & Customer Read-Only** (Auto-Approved).
   - Enter justification: *"Quarterly sales reporting audit"*.
   - Click **Submit Request**.
3. The system returns ephemeral credentials:
   - Ephemeral Username: `jit_<id>_<rand>`
   - Database: `target_db`
   - Expiration countdown timer.

---

### Step 3: Observe Legitimate Compliant Operations
Run Scenario A in a terminal to simulate normal analyst queries:
```bash
npm run simulate:a
```
**In the Administrator Dashboard:**
- Observe live query rows appear dynamically in the **Server-Side SQL Feed** without page refreshes!
- Notice operation badges: `SELECT` (blue).
- Notice Risk Score meter remains at **0/100 (LOW)**.
- Notice **Zero alerts** raised.

---

### Step 4: Live Attack Simulation (Mass Data Exfiltration)
In the terminal, run the data exfiltration attack:
```bash
npm run simulate:b
```
**Watch the Admin Dashboard react live:**
1. **Queries/Min velocity gauge spikes** immediately.
2. In the Live SQL Feed, queries are highlighted with violation tags:
   - `UNBOUNDED_BULK_READ` (amber / post-hoc detection)
3. In the Active Sessions table, the session's **Risk Meter surges to 80/100 (CRITICAL)**.
4. An **Insider Threat Risk Spike Alert** appears in real time in the Incident Queue.
5. Click **View Alert Details** to reveal the explainable breakdown:
   - Triggered Detectors: `high_query_velocity` (weight 25), `bulk_export` (weight 30), `out_of_profile_table` (weight 25).
   - Evidence Query IDs directly hyperlinked to the audit log.

---

### Step 5: Incident Triage & 1-Click Session Revocation
1. In the Alerts queue, click **Investigate** and change status to `investigating`, appending analyst notes:
   *"Quarantining compromised developer account."*
2. In the **Active Sessions** table, click the red **REVOKE** button on the offending session.
3. The backend immediately:
   - Kills the active MySQL connection thread (`KILL <thread_id>`).
   - Drops the temporary user account (`DROP USER 'jit_...'@'%'`).
   - Updates session state to `revoked`.
4. Any further queries from the client will immediately be rejected by MySQL engine with:
   `ER_ACCESS_DENIED_ERROR`.

---

### Step 6: Full Automated Scenario Evaluation Table
To verify the entire detection battery in one command:
```bash
npm run simulate:all
```
This runs all 5 scenarios (Normal, Exfiltration, Privilege Probing, Off-Hours Payroll, and Credential Sharing) and generates the comprehensive evaluation report table in the console and saves `docs/evaluation_results.md`.
