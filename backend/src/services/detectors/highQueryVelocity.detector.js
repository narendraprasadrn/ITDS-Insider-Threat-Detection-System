// backend/src/services/detectors/highQueryVelocity.detector.js

/**
 * High Query Velocity Detector
 * Detects sudden spikes in query execution rate relative to the user's historical baseline.
 *
 * @param {Array} events - Stream of SQL events for the session
 * @param {object} baseline - User's baseline { avg_velocity_qpm }
 * @param {object} [context] - { multiplier = 2.0, minQueries = 5 }
 * @returns {object|null} { rule_id, weight, evidence_event_ids, explanation } or null
 */
export function detectHighQueryVelocity(events, baseline, context = {}) {
  if (!events || events.length === 0 || !baseline) return null;

  const multiplier = context.multiplier || 2.0;
  const minQueries = context.minQueries || 5;
  const thresholdQpm = (baseline.avg_velocity_qpm || 5.0) * multiplier;

  // Sort events by timestamp
  const sorted = [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  if (sorted.length < minQueries) return null;

  // Calculate timespan across events in minutes
  const startTime = new Date(sorted[0].event_time).getTime();
  const endTime = new Date(sorted[sorted.length - 1].event_time).getTime();
  const durationMinutes = Math.max((endTime - startTime) / (1000 * 60), 0.1); // minimum 6 seconds

  const currentQpm = Math.round((sorted.length / durationMinutes) * 10) / 10;

  if (currentQpm > thresholdQpm) {
    return {
      rule_id: 'high_query_velocity',
      weight: 25,
      evidence_event_ids: sorted.map(e => e.id).filter(Boolean),
      explanation: `Observed query velocity (${currentQpm} QPM) exceeded user baseline (${baseline.avg_velocity_qpm} QPM) by ${multiplier}x threshold`
    };
  }

  return null;
}
