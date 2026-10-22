# Technical Design Limitations & Architectural Trade-offs

## 1. Enforcement Mechanisms: `blocked_by_db` vs `detected_post_hoc`

The Insider Threat Detection System (ITDS) employs a dual-tier policy enforcement architecture:

| Enforcement Type | Mechanism | Timing | Examples | Capabilities & Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **`blocked_by_db`** | Native MySQL 8 Least-Privilege GRANTs | **Pre-Execution** (Synchronous / Preventative) | - Ungranted DML (`DELETE`, `INSERT`, `UPDATE`)<br>- Table out of scope (`target_db.salaries`)<br>- Unauthorized DDL (`ALTER`, `DROP`) | **Hard Security Boundary**: Execution is physically blocked by the database engine with error code `1142 (42000)`. No sensitive data ever leaves MySQL storage engines. Zero bypass possibility via client evasion. |
| **`detected_post_hoc`** | Open Policy Agent (Rego) + AST Telemetry | **Post-Execution** (Asynchronous / Detective) | - Unbounded bulk reads (`SELECT *` without `LIMIT` or `WHERE`)<br>- Cross-schema reconnaissance<br>- Query velocity spikes<br>- Off-hours bulk extraction | **Semantic & Contextual Intelligence**: MySQL's native permission system has no concept of row limits, semantic intent, or behavioural baselines. Queries succeed at MySQL engine level, but are flagged within ~1.5s as high-risk security violations. |

---

## 2. Ingestion Model: `mysql.general_log` vs Database Proxy / MitM

### Why Server-Side `general_log` was Chosen:
1. **Client Agnostic & Tamper-Proof**: Regardless of whether a user connects via DBeaver, MySQL CLI, DataGrip, Python scripts, or direct socket connections, the MySQL server daemon writes the raw query directly to `mysql.general_log`. The user cannot disable or bypass logging without DBA root privileges.
2. **Dedicated Ephemeral Accounts**: Because every JIT session gets a unique account (`jit_<sessionId>_<rand>`), queries logged to `general_log` contain the exact ephemeral username in `user_host`, enabling 100% deterministic attribution.

### Trade-offs & Limitations:
1. **Auditing Latency (1.5s - 3.5s)**: Ingestion occurs on an asynchronous polling loop (every 1.5 seconds) from `mysql.general_log`. While pre-execution violations (`blocked_by_db`) are rejected synchronously by MySQL, semantic violations (`detected_post_hoc`) are analyzed 1-3 seconds after execution. In an exfiltration attack, data may have been transmitted to the client before the session is revoked.
2. **Log Volume Overhead**: On high-throughput production OLTP systems (e.g. >10,000 QPS), writing every statement to `mysql.general_log` table adds disk and lock contention overhead. In enterprise deployments, table logging is typically complemented with MySQL Enterprise Audit plugin or binary log CDC decoders.

---

## 3. SQL AST Parser Limitations

ITDS utilizes `node-sql-parser` with a regex-driven heuristic fallback engine:
1. **Parameterized Templates**: Dynamic literal replacement (`WHERE id = 5` -> `WHERE id = ?`) enables structural clustering.
2. **Non-Standard SQL / Vendor Dialects**: Highly vendor-specific procedural statements (e.g. `CALL stored_proc()`, `PREPARE stmt FROM ...`, `EXECUTE`) cannot always be parsed into a full Abstract Syntax Tree; for these, the heuristic fallback extracts target tables and primary keywords (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DDL`).
3. **Subquery Nesting**: Deeply nested subqueries and CTEs (`WITH cte AS ...`) are evaluated for table references across the entire parse tree, but column-level aliasing within CTE scopes is approximated.

---

## 4. Attribution Caveats & Connection Pooling

### 4.1 Connection Pool Bypasses
In applications where backends multiplex user queries over a static connection pool (e.g. standard multi-tenant microservices connecting as `app_user`), individual end-user identity is not visible in `mysql.general_log`'s `user_host` field.
- **Academic Prototype Solution**: Direct JIT developer/analyst access relies on dedicated ephemeral accounts (`jit_<sessionId>_<rand>`).
- **Production Solution**: Application-level proxies or connection session variables (e.g. `SET @itds_authenticated_user = 'dev1'`) must be prepended to pooled connections.

### 4.2 Out-of-Band Root / DBA Access
Queries executed directly by DBA accounts (`root`, `mysql.sys`, or `itds_admin`) outside the JIT lifecycle cannot be automatically bound to an interactive `db_sessions` entity. ITDS isolates these queries and categorizes them with `status = 'unattributed'`, raising policy alerts if they touch protected tables or execute DDL.

---

## 5. Ephemeral Account Lifecycle & Namespace Management

1. **MySQL User Limits**: Maintaining hundreds of concurrent JIT users requires appropriate `max_user_connections` configuration in MySQL.
2. **Abrupt Process Termination**: When a session is revoked or expires, ITDS executes `KILL <thread_id>` on active connections and drops the user. If a multi-statement transaction is mid-flight, MySQL safely rolls back uncommitted changes, but client applications receive abrupt socket disconnects (`ER_ACCESS_DENIED_ERROR`).

---

## 6. Enterprise Production Recommendations

| Prototype Component | Academic Prototype Implementation | Enterprise Grade Recommendation |
| :--- | :--- | :--- |
| **Log Storage** | `mysql.general_log` (CSV / InnoDB table) | MySQL Enterprise Audit Plugin, eBPF socket tracing, or Kafka Debezium CDC |
| **Ingestion Polling** | Node.js `setInterval` polling (1.5s loop) | Streaming log pipelines (Vector, FluentBit, Apache Kafka) |
| **Policy Evaluation** | In-process HTTP queries to local OPA daemon | Envoy Proxy with OPA WebAssembly (Wasm) filters at network ingress |
| **Risk Baselines** | Rule-based moving averages & threshold heuristics | Isolation Forests / Autoencoders for multi-dimensional anomaly detection |
