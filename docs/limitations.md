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
1. **Auditing Latency (1.5s)**: Ingestion occurs on an asynchronous polling loop (every 1.5 seconds) from `mysql.general_log`. While pre-execution violations (`blocked_by_db`) are rejected synchronously by MySQL, semantic violations (`detected_post_hoc`) are analyzed 1-2 seconds after execution.
2. **Log Volume Overhead**: On high-throughput production OLTP systems (e.g. >10,000 QPS), writing every statement to `mysql.general_log` table adds I/O overhead. In enterprise deployments, table logging is typically complemented with MySQL Enterprise Audit plugin or binary log decoders.

---

## 3. SQL AST Parser Limitations

ITDS utilizes `node-sql-parser` with a regex-driven heuristic fallback engine:
1. **Parameterized Templates**: Dynamic literal replacement (`WHERE id = 5` -> `WHERE id = ?`) enables structural clustering.
2. **Non-Standard SQL / Vendor Dialects**: Highly vendor-specific procedural statements (e.g. `CALL stored_proc()`, `PREPARE stmt FROM ...`, `EXECUTE`) cannot always be parsed into a full Abstract Syntax Tree; for these, the heuristic fallback extracts target tables and primary keywords (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DDL`).
3. **Subquery Nesting**: Deeply nested subqueries and CTEs (`WITH cte AS ...`) are evaluated for table references across the entire parse tree, but column-level aliasing within CTE scopes is approximated.
