// backend/src/services/detectors/outOfProfileTable.detector.js

/**
 * Out-of-Profile Table Detector
 * Identifies queries accessing tables that deviate from the user's historical access baseline.
 *
 * @param {Array} events - Stream of SQL events for the session
 * @param {object} baseline - User's baseline { typical_tables }
 * @param {object} [context]
 * @returns {object|null} { rule_id, weight, evidence_event_ids, explanation } or null
 */
export function detectOutOfProfileTable(events, baseline, context = {}) {
  if (!events || events.length === 0 || !baseline) return null;

  const typicalTables = Array.isArray(baseline.typical_tables)
    ? baseline.typical_tables
    : (typeof baseline.typical_tables === 'string' ? JSON.parse(baseline.typical_tables) : []);

  const normalizedTypical = typicalTables.map(t => t.toLowerCase());

  const anomalousEvents = [];
  const anomalousTables = new Set();

  for (const evt of events) {
    const rawTables = typeof evt.tables === 'string' ? JSON.parse(evt.tables) : (evt.tables || []);
    if (!Array.isArray(rawTables) || rawTables.length === 0) continue;

    let hasAnomaly = false;
    for (const table of rawTables) {
      const lower = table.toLowerCase();
      // Match exact or match unqualified table name e.g. "customers" in "target_db.customers"
      const isKnown = normalizedTypical.some(t => t === lower || t.endsWith(`.${lower}`) || lower.endsWith(`.${t}`));

      if (!isKnown) {
        hasAnomaly = true;
        anomalousTables.add(table);
      }
    }

    if (hasAnomaly) {
      anomalousEvents.push(evt);
    }
  }

  if (anomalousEvents.length > 0) {
    return {
      rule_id: 'out_of_profile_table',
      weight: 25,
      evidence_event_ids: anomalousEvents.map(e => e.id).filter(Boolean),
      explanation: `Query accessed database tables outside user's historical baseline profile scope: ${[...anomalousTables].join(', ')}`
    };
  }

  return null;
}
