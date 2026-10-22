# Insider Threat Detection System (ITDS) - System Architecture

## 1. System Overview

The **Insider Threat Detection System (ITDS)** is an academic prototype designed to provide granular Just-In-Time (JIT) access governance, server-side SQL activity monitoring, policy enforcement via Open Policy Agent (OPA), and explainable risk scoring for organizational databases.

```mermaid
flowchart TD
    subgraph Client Layer
        Browser[Security Analyst / DBA Browser]
        DevClient[Developer / DBeaver / CLI Client]
    end

    subgraph Presentation & Control
        ViteUI[Frontend: React 18 + Vite + MUI]
        Browser -->|HTTPS / UI Interactions| ViteUI
        ViteUI -->|EventSource :5000/stream| SSEReceiver[Real-Time SSE Receiver]
    end

    subgraph Backend Core [Node.js + Express ESM]
        API[Express REST Gateway :5000]
        AuthModule[JWT + RBAC Middleware]
        JITService[JIT Provisioning Engine]
        Ingestor[Log Ingestion Poller 1.5s]
        SQLParser[SQL AST Parser node-sql-parser]
        RiskEngine[Explainable Threat & Risk Engine]
        SSEBroadcaster[SSE Broadcasting Bus]
    end

    subgraph Policy Governance [Open Policy Agent]
        OPA[OPA Daemon :8181]
        AccessRego[policies/access_request.rego]
        QueryRego[policies/sql_query.rego]
        OPA --> AccessRego
        OPA --> QueryRego
    end

    subgraph Database Tier [MySQL 8 Engine]
        MySQLDaemon[(MySQL 8 Daemon :3306)]
        GeneralLog[(mysql.general_log TABLE)]
        AppDB[(itds_app Schema)]
        TargetDB[(target_db Protected Schema)]
    end

    %% Interactions
    ViteUI -->|REST API Requests| API
    API --> AuthModule
    AuthModule --> JITService
    JITService -->|Evaluate Request| OPA
    JITService -->|CREATE USER / GRANT / KILL| MySQLDaemon
    DevClient -->|SQL Queries as jit_* user| MySQLDaemon
    MySQLDaemon -->|Write Telemetry log_output=TABLE| GeneralLog
    Ingestor -->|Poll Queries > watermark| GeneralLog
    Ingestor --> SQLParser
    SQLParser -->|Parsed AST & Flags| Ingestor
    Ingestor -->|Store Ingested Events| AppDB
    Ingestor -->|Evaluate Query Policy| OPA
    OPA -->|Rule Violations blocked_by_db / detected_post_hoc| Ingestor
    Ingestor --> RiskEngine
    RiskEngine -->|Aggregate Fired Detectors| RiskEngine
    RiskEngine -->|Persist Risk & Alerts| AppDB
    RiskEngine -->|Emit Live Events| SSEBroadcaster
    SSEBroadcaster -->|Broadcast query / violation / risk / alert| ViteUI
```

---

## 2. Entity-Relationship (ER) Architecture

The database architecture is split into two isolated schemas:
1. `itds_app`: Controls users, roles, permissions, access requests, JIT sessions, audit trails, and risk telemetry.
2. `target_db`: Represents the protected enterprise database containing organizational datasets.

```mermaid
erDiagram
    %% itds_app core tables
    USERS ||--o{ USER_ROLES : has
    ROLES ||--o{ USER_ROLES : assigned_to
    ROLES ||--o{ ROLE_PERMISSIONS : includes
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : granted_by
    ROLES ||--o{ ROLE_PROFILES : permits
    ACCESS_PROFILES ||--o{ ROLE_PROFILES : mapped_to

    ACCESS_PROFILES ||--o{ PROFILE_RESOURCES : defines
    RESOURCE_INVENTORY ||--o{ PROFILE_RESOURCES : contains

    USERS ||--o{ ACCESS_REQUESTS : submits
    ACCESS_PROFILES ||--o{ ACCESS_REQUESTS : requests
    ACCESS_REQUESTS ||--o{ APPROVALS : decided_by
    USERS ||--o{ APPROVALS : approves

    ACCESS_REQUESTS ||--o| DB_SESSIONS : provisions
    USERS ||--o{ DB_SESSIONS : assigned_to
    ACCESS_PROFILES ||--o{ DB_SESSIONS : uses

    DB_SESSIONS ||--o{ SQL_EVENTS : executes
    USERS ||--o{ SQL_EVENTS : attributes

    SQL_EVENTS ||--o{ POLICY_VIOLATIONS : generates
    DB_SESSIONS ||--o{ POLICY_VIOLATIONS : contains
    USERS ||--o{ POLICY_VIOLATIONS : incurs

    DB_SESSIONS ||--|| SESSION_RISK_SCORES : scores
    USERS ||--o{ SESSION_RISK_SCORES : tracks
    USERS ||--o| USER_BASELINES : establishes

    DB_SESSIONS ||--o{ ALERTS : triggers
    USERS ||--o{ ALERTS : targets
    USERS ||--o{ AUDIT_LOG : actions

    %% itds_app Entity Definitions
    USERS {
        int id PK
        string username UK
        string email UK
        string password_hash
        boolean is_active
        datetime created_at
    }

    ROLES {
        int id PK
        string name UK
        string description
    }

    PERMISSIONS {
        int id PK
        string code UK
        string description
    }

    ACCESS_PROFILES {
        int id PK
        string name UK
        string description
        int max_duration_minutes
        boolean requires_approval
        json allowed_operations
    }

    RESOURCE_INVENTORY {
        int id PK
        string db_name
        string table_name
        string sensitivity
        string description
    }

    ACCESS_REQUESTS {
        int id PK
        int user_id FK
        int profile_id FK
        int requested_duration_minutes
        text justification
        enum status
        string decision_action
        json decision_reasons
        datetime created_at
    }

    DB_SESSIONS {
        int id PK
        int request_id FK
        int user_id FK
        int profile_id FK
        enum status
        datetime start_time
        datetime end_time
        string mysql_username UK
        json granted_operations
        json granted_resources
    }

    SQL_EVENTS {
        bigint id PK
        int session_id FK
        int user_id FK
        string mysql_username
        int thread_id
        datetime event_time
        text raw_sql
        text normalized_sql
        string operation
        json tables
        json flags
        string status
    }

    POLICY_VIOLATIONS {
        int id PK
        bigint event_id FK
        int session_id FK
        int user_id FK
        string rule
        enum severity
        string reason
        enum enforcement_type
        datetime detected_at
    }

    SESSION_RISK_SCORES {
        int id PK
        int session_id UK, FK
        int user_id FK
        int score
        enum risk_level
        json breakdown
        datetime calculated_at
    }

    USER_BASELINES {
        int id PK
        int user_id UK, FK
        float avg_velocity_qpm
        json typical_tables
        int typical_hours_start
        int typical_hours_end
        int sample_size_queries
    }

    ALERTS {
        int id PK
        int session_id FK
        int user_id FK
        int risk_score
        string title
        text description
        enum status
        enum severity
        json evidence
        text analyst_notes
        datetime created_at
    }

    AUDIT_LOG {
        int id PK
        int user_id FK
        string username
        string event_type
        string status
        json details
        string ip_address
        datetime created_at
    }

    %% target_db Tables
    DEPARTMENTS ||--o{ EMPLOYEES : employs
    EMPLOYEES ||--o{ SALARIES : earns
    CUSTOMERS ||--o{ ORDERS : places
    ORDERS ||--o{ PAYMENTS : pays

    DEPARTMENTS {
        int department_id PK
        string name UK
        string building
        decimal budget
    }

    EMPLOYEES {
        int employee_id PK
        string employee_code UK
        string first_name
        string last_name
        string email UK
        int department_id FK
        string job_title
        date hire_date
        enum status
    }

    SALARIES {
        int salary_id PK
        int employee_id FK
        decimal base_salary
        decimal bonus
        date effective_date
    }

    CUSTOMERS {
        int customer_id PK
        string customer_code UK
        string company_name
        string contact_name
        string email UK
        string phone
        string city
        string country
        decimal credit_limit
    }

    ORDERS {
        int order_id PK
        int customer_id FK
        string order_number UK
        date order_date
        decimal total_amount
        enum status
    }

    PAYMENTS {
        int payment_id PK
        int order_id FK
        string payment_ref UK
        date payment_date
        decimal amount
        enum payment_method
        enum status
    }
```

---

## 3. Core Architectural Subsystems

### 3.1 Just-In-Time (JIT) Credential Lifecycle
1. **Request & Policy Gating**: An analyst or developer requests access to a predefined profile. OPA evaluates the request against `policies/access_request.rego` considering role, sensitivity, time of day, and duration.
2. **Dynamic Provisioning**: Upon approval, the backend connects as `itds_admin` and creates a dedicated MySQL account:
   ```sql
   CREATE USER 'jit_<requestId>_<rand>'@'%' IDENTIFIED BY '<random_pass>';
   GRANT SELECT ON target_db.customers TO 'jit_<requestId>_<rand>'@'%';
   ```
3. **Session Attribution**: The ephemeral username is mapped to `db_sessions.id` and `users.id`.
4. **Revocation & Expiry**: When the session expires or is manually revoked via the console, the backend kills active threads in `information_schema.processlist` and drops the user.

### 3.2 Server-Side SQL Auditing (`mysql.general_log`)
- Monitoring operates independently of client configuration (DBeaver, DataGrip, MySQL CLI, scripts).
- MySQL daemon writes executed statements directly to `mysql.general_log` (`log_output='TABLE'`).
- The backend log poller reads from `mysql.general_log` above a persistent high-water mark (`itds_app.ingest_watermark`), parses queries with `node-sql-parser`, and extracts target tables, AST flags (`select_star`, `has_limit`, `has_where`, `is_ddl`, `is_cross_schema`), and operations.

### 3.3 Decoupled OPA Policy Evaluation
- Ingested queries are sent to OPA via REST API (`/v1/data/itds/sql/evaluate`).
- Evaluates against `policies/sql_query.rego` verifying:
  - Allowed operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DDL`)
  - Permitted table scopes
  - Session validity and expiry status
  - Bounded read compliance (`LIMIT` clause enforcement on large tables)
- Violations are classified into:
  - **`blocked_by_db`**: Pre-execution physical denials by MySQL engine (`ER_TABLEACCESS_DENIED_ERROR`).
  - **`detected_post_hoc`**: Contextual and semantic violations captured by audit telemetry.

### 3.4 Multi-Detector Risk Engine
Composite risk scoring aggregates six deterministic, pure detector functions:
1. `high_query_velocity` (weight 25): Spikes exceeding 2x the user's historical QPM baseline.
2. `bulk_export` (weight 30): Unbounded `SELECT *` dumps without `LIMIT` or `WHERE`.
3. `off_hours_activity` (weight 20): Queries executed outside the user's regular working hours.
4. `out_of_profile_table` (weight 25): Accessing tables outside the user's typical baseline scope.
5. `rapid_failed_queries` (weight 25): Permission denials and failed probes within a session.
6. `cross_schema_read` (weight 30): Queries spanning multiple schemas or probing system tables (`information_schema`, `mysql`).

Risk score is computed as:
$$\text{Risk Score} = \min\left(100, \sum_{\text{fired}} \text{weight}\right)$$

When Risk Score $\ge 70$, a deduplicated Security Alert is generated with complete explainable evidence trails.

### 3.5 Real-Time Reactive Pipeline (SSE)
- Security consoles connect to `GET /stream?token=<token>`.
- Heartbeat keep-alive every 15 seconds.
- Pushes events asynchronously as they are ingested and evaluated:
  - `query_observed`: Streaming SQL statements with attribution badges.
  - `violation_detected`: Real-time policy violations.
  - `risk_updated`: Dynamic session risk recalibration.
  - `alert_created`: High-severity incident alerts.
