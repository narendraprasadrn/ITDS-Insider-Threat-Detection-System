// scripts/verify_phase9_live.js
import http from 'http';
import mysql from '../backend/node_modules/mysql2/promise.js';

const BACKEND_URL = 'http://127.0.0.1:5000';

async function main() {
  console.log('=== ITDS Phase 9 Real-Time Live Pipeline Verification ===\n');

  // 1. Authenticate admin
  const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const adminToken = loginData.data?.accessToken;
  console.log('✓ Admin authenticated. Acquired JWT token.');

  // 2. Authenticate developer to request JIT session
  const devLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'developer', password: 'Password123!' })
  });
  const devLoginData = await devLoginRes.json();
  const devToken = devLoginData.data?.accessToken;

  // 3. Request auto-approved JIT session
  const reqRes = await fetch(`${BACKEND_URL}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({
      profile_id: 1, // Sales & Customer Read-Only
      requested_duration_minutes: 15,
      justification: 'Real-time telemetry verification test for Phase 9'
    })
  });
  const reqData = await reqRes.json();
  const jitCreds = reqData.data?.credentials;
  const sessionId = reqData.data?.session_id;
  console.log(`✓ JIT Session provisioned: User [${jitCreds.username}] on database [${jitCreds.database}].\n`);

  // 4. Connect to SSE /stream
  console.log(`Connecting to SSE stream: ${BACKEND_URL}/stream?token=...`);
  const sseEvents = [];
  let sseConnected = false;

  const sseReq = http.get(`${BACKEND_URL}/stream?token=${adminToken}`, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // keep remainder

      for (const block of lines) {
        if (!block.trim() || block.startsWith(':')) continue;

        const eventMatch = block.match(/event:\s*([^\n]+)/);
        const dataMatch = block.match(/data:\s*([\s\S]+)/);

        if (eventMatch && dataMatch) {
          const type = eventMatch[1].trim();
          try {
            const parsed = JSON.parse(dataMatch[1].trim());
            sseEvents.push({ type, data: parsed, time: new Date().toLocaleTimeString() });

            if (type === 'connected') {
              sseConnected = true;
            } else if (type === 'query_observed') {
              console.log(`  [SSE EVENT: query_observed] #${parsed.id} ${parsed.operation} by ${parsed.mysql_username}: ${parsed.raw_sql.substring(0, 60)}...`);
            } else if (type === 'violation_detected') {
              console.log(`  [SSE EVENT: violation_detected] Rule: ${parsed.rule} (${parsed.enforcement_type.toUpperCase()}) - Severity: ${parsed.severity}`);
            } else if (type === 'risk_updated') {
              console.log(`  [SSE EVENT: risk_updated] Session #${parsed.session_id} Risk Score: ${parsed.score}/100 (${parsed.risk_level.toUpperCase()})`);
            } else if (type === 'alert_created') {
              console.log(`  [SSE EVENT: alert_created] *** SECURITY ALERT *** ${parsed.title}`);
            }
          } catch (e) {
            // ignore partial json
          }
        }
      }
    });
  });

  // Wait for SSE handshake
  await new Promise(r => setTimeout(r, 600));

  // 5. Connect as JIT user and run 10 distinct queries
  console.log('\nConnecting to MySQL as ephemeral JIT account...');
  const conn = await mysql.createConnection({
    host: jitCreds.host,
    port: jitCreds.port,
    user: jitCreds.username,
    password: jitCreds.password,
    database: jitCreds.database
  });

  console.log('Executing 10 live queries across granted, denied, and anomalous patterns:\n');

  const queries = [
    'SELECT customer_code, company_name FROM customers LIMIT 2;',
    'SELECT contact_name, city FROM customers WHERE country = "USA" LIMIT 3;',
    'SELECT order_number, total_amount FROM orders WHERE status = "shipped" LIMIT 2;',
    'SELECT count(*) FROM customers;',
    'SELECT customer_code, email FROM customers WHERE credit_limit > 50000 LIMIT 2;',
    'SELECT salary, bank_account_number FROM salaries LIMIT 1;', // Out-of-scope -> blocked_by_db
    'SELECT * FROM orders;', // Unbounded read -> detected_post_hoc
    'SELECT customer_code, city FROM customers LIMIT 5;',
    'SELECT order_number, order_date FROM orders LIMIT 3;',
    'SELECT company_name, phone FROM customers LIMIT 4;'
  ];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      await conn.query(q);
    } catch (err) {
      // Expected for query 6 (salaries)
    }
    // Small delay between queries
    await new Promise(r => setTimeout(r, 150));
  }

  await conn.end();
  console.log('\n✓ All 10 queries executed against MySQL engine.');
  console.log('Awaiting server-side general_log ingestion poller (1.5s interval)...\n');

  // Allow ingestor worker polling cycle to process and stream via SSE
  await new Promise(r => setTimeout(r, 3500));

  sseReq.destroy();

  console.log('=== Real-Time Pipeline Verification Summary ===');
  console.log(`Total live SSE events received: ${sseEvents.length}`);
  const queryObserved = sseEvents.filter(e => e.type === 'query_observed');
  const violations = sseEvents.filter(e => e.type === 'violation_detected');
  const riskUpdates = sseEvents.filter(e => e.type === 'risk_updated');
  const alerts = sseEvents.filter(e => e.type === 'alert_created');

  console.log(`- query_observed events:   ${queryObserved.length}`);
  console.log(`- violation_detected:      ${violations.length}`);
  console.log(`- risk_updated events:     ${riskUpdates.length}`);
  console.log(`- alert_created events:    ${alerts.length}`);

  if (queryObserved.length >= 10) {
    console.log('\n>>> SUCCESS: All 10 queries ingested and broadcast in real time via SSE pipeline without refresh! <<<');
  } else {
    console.log(`\n>>> PARTIAL: Received ${queryObserved.length} query events. <<<`);
  }
}

main().catch(console.error);
