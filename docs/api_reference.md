# Insider Threat Detection System (ITDS) - REST API Reference

All requests accept and return JSON payloads. Protected endpoints require a valid JWT token passed in the `Authorization: Bearer <token>` header (or `?token=<token>` query param for EventSource / SSE).

---

## 1. System & Health

### `GET /health`
Returns system health, server uptime, database connectivity, and OPA status.
- **Auth Required:** No
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 124.5,
    "responseTimeMs": 15,
    "timestamp": "2026-10-22T12:00:00.000Z",
    "dependencies": {
      "database": { "status": "connected" },
      "opa": { "status": "connected" }
    }
  }
}
```

---

## 2. Authentication & Session Management

### `POST /auth/login`
Authenticates a user and issues an access JWT token and refresh token.
- **Auth Required:** No
- **Request Body**:
```json
{
  "username": "developer",
  "password": "Password123!"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "eyJhbGciOiJIUzI1Ni...",
    "user": {
      "id": 4,
      "username": "developer",
      "email": "dev@itds.internal",
      "roles": ["developer"],
      "permissions": ["sessions:request"]
    }
  }
}
```

### `GET /auth/me`
Fetches current authenticated user's profile and granted permissions.
- **Auth Required:** Yes
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 4,
      "username": "developer",
      "email": "dev@itds.internal",
      "roles": ["developer"],
      "permissions": ["sessions:request"]
    }
  }
}
```

### `POST /auth/refresh`
Refreshes an expired access token using a valid refresh token.
- **Request Body**: `{ "refreshToken": "..." }`
- **Response `200 OK`**: `{ "success": true, "data": { "accessToken": "..." } }`

---

## 3. Access Profiles & Resource Governance

### `GET /profiles/available`
Lists access profiles available for the authenticated user to request.
- **Auth Required:** Yes
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "id": 1,
        "name": "Sales & Customer Read-Only",
        "description": "Read-only access to customer and order records",
        "max_duration_minutes": 120,
        "requires_approval": false,
        "allowed_operations": ["SELECT"],
        "resources": [
          { "db_name": "target_db", "table_name": "customers", "sensitivity": "low" },
          { "db_name": "target_db", "table_name": "orders", "sensitivity": "medium" }
        ]
      }
    ]
  }
}
```

### `GET /api/resources`
Lists inventory of protected tables and sensitivity classifications.
- **Auth Required:** Yes (`admin`, `dba`, `security_analyst`)
- **Response `200 OK`**: Returns array of protected resources in `target_db`.

---

## 4. JIT Access Requests

### `POST /access-requests`
Submits a Just-In-Time access request. Evaluated by OPA.
- **Auth Required:** Yes (`sessions:request`)
- **Request Body**:
```json
{
  "profile_id": 1,
  "requested_duration_minutes": 30,
  "justification": "Customer dispute investigation"
}
```
- **Response `201 Created` (Auto-Approved)**:
```json
{
  "success": true,
  "data": {
    "status": "approved",
    "requestId": 15,
    "sessionId": 12,
    "credentials": {
      "host": "127.0.0.1",
      "port": 3306,
      "database": "target_db",
      "username": "jit_15_a83f91",
      "password": "JitPassword123!",
      "expiresAt": "2026-10-22T12:30:00.000Z",
      "durationMinutes": 30
    }
  }
}
```
- **Response `200 OK` (Pending Supervisor Approval)**:
```json
{
  "success": true,
  "data": {
    "status": "pending",
    "requestId": 16,
    "decision": {
      "action": "require_approval",
      "reasons": ["Profile is configured with mandatory supervisor approval"]
    },
    "message": "Request submitted to administrator approval queue."
  }
}
```

### `GET /access-requests/pending`
Lists pending access requests awaiting administrator review.
- **Auth Required:** Yes (`sessions:approve`)

### `POST /access-requests/:id/approve`
Approves a pending access request and provisions an ephemeral MySQL account.
- **Auth Required:** Yes (`sessions:approve`)
- **Request Body**: `{ "comments": "Approved for business review" }`
- **Response `200 OK`**: Returns provisioned JIT session and database credentials.

### `POST /access-requests/:id/deny`
Denies a pending request.
- **Auth Required:** Yes (`sessions:approve`)
- **Request Body**: `{ "comments": "Insufficient justification" }`

---

## 5. Active Sessions & Revocation

### `GET /sessions/active`
Lists currently active JIT database sessions with remaining time and live risk scores.
- **Auth Required:** Yes (`audit:read`)

### `POST /sessions/:id/revoke`
Immediately terminates active connection threads and drops the ephemeral MySQL user.
- **Auth Required:** Yes (`sessions:revoke`)
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "sessionId": 12,
    "status": "revoked",
    "message": "JIT session successfully revoked and temporary MySQL user dropped"
  }
}
```

---

## 6. SQL Activity Ingestion & Policy Violations

### `GET /sql-events`
Queries ingested SQL telemetry with filters.
- **Query Params:** `session_id`, `user_id`, `operation`, `status`, `limit`, `offset`
- **Auth Required:** Yes (`audit:read`)
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": 85,
        "session_id": 12,
        "mysql_username": "jit_15_a83f91",
        "thread_id": 42,
        "event_time": "2026-10-22T12:15:30.000Z",
        "raw_sql": "SELECT * FROM orders;",
        "operation": "SELECT",
        "tables": ["orders"],
        "flags": { "select_star": true, "has_limit": false, "has_where": false },
        "status": "attributed"
      }
    ]
  }
}
```

### `GET /violations`
Lists policy violations evaluated by OPA against ingested SQL activity.
- **Query Params:** `session_id`, `user_id`, `rule`, `severity`, `enforcement_type`, `limit`, `offset`
- **Auth Required:** Yes (`audit:read`)
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "violations": [
      {
        "id": 41,
        "event_id": 85,
        "session_id": 12,
        "rule": "UNBOUNDED_BULK_READ",
        "severity": "medium",
        "enforcement_type": "detected_post_hoc",
        "reason": "Unbounded SELECT query on orders without WHERE or LIMIT clause",
        "raw_sql": "SELECT * FROM orders;"
      }
    ]
  }
}
```

---

## 7. Threat Detection & Security Alerts

### `GET /risk-scores`
Lists session risk scores with explainable detector breakdowns.
- **Query Params:** `session_id`, `user_id`, `risk_level`, `limit`, `offset`
- **Auth Required:** Yes (`threats:view`)

### `GET /risk-scores/:sessionId`
Fetches current risk score and detector breakdown for a specific session.
- **Auth Required:** Yes (`threats:view`)

### `GET /alerts`
Lists incident triage alerts.
- **Query Params:** `session_id`, `user_id`, `status`, `severity`, `limit`, `offset`
- **Auth Required:** Yes (`threats:view`)

### `PATCH /alerts/:id`
Updates alert triage status (`open` -> `investigating` -> `closed`) and appends analyst notes.
- **Auth Required:** Yes (`threats:manage`)
- **Request Body**:
```json
{
  "status": "investigating",
  "notes": "Session quarantined. Ephemeral MySQL user revoked."
}
```

---

## 8. Real-Time Streaming Pipeline (SSE)

### `GET /stream`
Server-Sent Events pipeline broadcasting live security telemetry.
- **Auth Required:** Yes (`audit:read` or `threats:view` via header or `?token=<token>`)
- **Headers**: `Accept: text/event-stream`
- **Event Types Broadcast**:
  - `connected`: Initial handshake confirmation.
  - `query_observed`: Ingested SQL telemetry with user and session attribution.
  - `violation_detected`: Policy violations identified by OPA.
  - `risk_updated`: Dynamic session risk score recalculation.
  - `alert_created`: High-severity security incident alerts.
