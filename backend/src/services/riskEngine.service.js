// backend/src/services/riskEngine.service.js
import { pool } from '../db/pool.js';
import { detectors } from './detectors/index.js';
import { logger } from '../config/logger.js';

class RiskEngineService {
  constructor() {
    this.alertListeners = [];
    this.scoreListeners = [];
  }

  onAlert(listener) {
    this.alertListeners.push(listener);
  }

  emitAlert(alert) {
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch (err) {
        logger.error({ err, alertId: alert.id }, 'Error in alert listener');
      }
    }
  }

  onScoreUpdate(listener) {
    this.scoreListeners.push(listener);
  }

  emitScoreUpdate(scoreData) {
    for (const listener of this.scoreListeners) {
      try {
        listener(scoreData);
      } catch (err) {
        logger.error({ err, sessionId: scoreData.session_id }, 'Error in score update listener');
      }
    }
  }

  /**
   * Fetch user behavioral baseline or provide sensible enterprise defaults
   */
  async getUserBaseline(userId) {
    if (!userId) {
      return {
        avg_velocity_qpm: 5.0,
        typical_tables: ['target_db.customers', 'target_db.orders'],
        typical_hours_start: 9,
        typical_hours_end: 18
      };
    }

    const [rows] = await pool.query(
      `SELECT avg_velocity_qpm, typical_tables, typical_hours_start, typical_hours_end
       FROM user_baselines WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (rows.length > 0) {
      return {
        ...rows[0],
        typical_tables: typeof rows[0].typical_tables === 'string'
          ? JSON.parse(rows[0].typical_tables)
          : rows[0].typical_tables
      };
    }

    return {
      avg_velocity_qpm: 5.0,
      typical_tables: ['target_db.customers', 'target_db.orders'],
      typical_hours_start: 9,
      typical_hours_end: 18
    };
  }

  /**
   * Pure deterministic score calculation from events and baseline
   * @param {Array} events
   * @param {object} baseline
   * @param {object} [context]
   * @returns {object} { score, risk_level, breakdown }
   */
  calculateRiskScore(events, baseline, context = {}) {
    const breakdown = [];

    for (const detector of detectors) {
      try {
        const fire = detector.fn(events, baseline, context);
        if (fire) {
          breakdown.push({
            rule_id: fire.rule_id,
            weight: fire.weight,
            evidence_event_ids: fire.evidence_event_ids || [],
            explanation: fire.explanation
          });
        }
      } catch (detErr) {
        logger.error({ err: detErr, detectorId: detector.id }, 'Error executing threat detector');
      }
    }

    // Sum weights and clamp to [0, 100]
    const rawScore = breakdown.reduce((acc, curr) => acc + curr.weight, 0);
    const score = Math.min(Math.max(rawScore, 0), 100);

    let riskLevel = 'low';
    if (score >= 75) riskLevel = 'critical';
    else if (score >= 50) riskLevel = 'high';
    else if (score >= 25) riskLevel = 'medium';

    return {
      score,
      risk_level: riskLevel,
      breakdown
    };
  }

  /**
   * Evaluate and record explainable risk score for a live session
   * @param {number} sessionId
   */
  async evaluateSessionRisk(sessionId) {
    if (!sessionId) return null;

    try {
      // 1. Fetch session details
      const [sessRows] = await pool.query(
        `SELECT id, user_id, mysql_username, status FROM db_sessions WHERE id = ? LIMIT 1`,
        [sessionId]
      );
      if (sessRows.length === 0) return null;
      const session = sessRows[0];

      // 2. Fetch session's SQL events
      const [events] = await pool.query(
        `SELECT se.*,
                EXISTS(SELECT 1 FROM policy_violations pv WHERE pv.event_id = se.id AND pv.enforcement_type = 'blocked_by_db') AS has_blocked_violation
         FROM sql_events se
         WHERE se.session_id = ?
         ORDER BY se.event_time ASC`,
        [sessionId]
      );

      // 3. Fetch user baseline
      const baseline = await this.getUserBaseline(session.user_id);

      // 4. Calculate score
      const { score, risk_level, breakdown } = this.calculateRiskScore(events, baseline);

      // 5. Persist to session_risk_scores
      await pool.query(
        `INSERT INTO session_risk_scores (session_id, user_id, score, risk_level, breakdown)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           score = VALUES(score),
           risk_level = VALUES(risk_level),
           breakdown = VALUES(breakdown),
           calculated_at = CURRENT_TIMESTAMP`,
        [sessionId, session.user_id, score, risk_level, JSON.stringify(breakdown)]
      );

      const scorePayload = {
        session_id: sessionId,
        user_id: session.user_id,
        score,
        risk_level,
        breakdown,
        calculated_at: new Date()
      };

      this.emitScoreUpdate(scorePayload);

      // 6. Alert Generation: Trigger alert if score >= 70 and not already alerted
      if (score >= 70) {
        await this.handleAlertGeneration(session, score, risk_level, breakdown);
      }

      return scorePayload;
    } catch (err) {
      logger.error({ err, sessionId }, 'Error evaluating session risk');
      return null;
    }
  }

  /**
   * Deduplicate and generate alerts for high-risk sessions
   */
  async handleAlertGeneration(session, score, riskLevel, breakdown) {
    // Check if an open or investigating alert already exists for this session
    const [existingAlerts] = await pool.query(
      `SELECT id, status FROM alerts
       WHERE session_id = ? AND status IN ('open', 'investigating')
       LIMIT 1`,
      [session.id]
    );

    if (existingAlerts.length > 0) {
      // Alert already exists and is active; update current score and evidence
      await pool.query(
        `UPDATE alerts SET risk_score = ?, severity = ?, evidence = ? WHERE id = ?`,
        [score, riskLevel, JSON.stringify(breakdown), existingAlerts[0].id]
      );
      return;
    }

    // Build alert title & description from fired detector explanations
    const rulesFired = breakdown.map(b => b.rule_id).join(', ');
    const title = `Insider Threat Risk Spike on Session #${session.id} (${riskLevel.toUpperCase()} - Score: ${score})`;
    const description = `Detectors triggered: [${rulesFired}]. Total calculated risk score reached ${score}/100. Immediate analyst review recommended.`;

    const [alertRes] = await pool.query(
      `INSERT INTO alerts (session_id, user_id, risk_score, title, description, status, severity, evidence)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      [session.id, session.user_id, score, title, description, riskLevel, JSON.stringify(breakdown)]
    );

    const alertPayload = {
      id: alertRes.insertId,
      session_id: session.id,
      user_id: session.user_id,
      risk_score: score,
      title,
      description,
      status: 'open',
      severity: riskLevel,
      evidence: breakdown,
      created_at: new Date()
    };

    logger.warn({ alertId: alertRes.insertId, sessionId: session.id, score }, 'Security Alert generated');
    this.emitAlert(alertPayload);
  }

  /**
   * List session risk scores
   */
  async listRiskScores({ sessionId, userId, riskLevel, limit = 100, offset = 0 } = {}) {
    let sql = `
      SELECT srs.id, srs.session_id, srs.user_id, srs.score, srs.risk_level,
             srs.breakdown, srs.calculated_at,
             u.username, u.full_name,
             p.name AS profile_name
      FROM session_risk_scores srs
      INNER JOIN db_sessions ds ON srs.session_id = ds.id
      INNER JOIN users u ON srs.user_id = u.id
      INNER JOIN access_profiles p ON ds.profile_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (sessionId) {
      sql += ' AND srs.session_id = ?';
      params.push(sessionId);
    }
    if (userId) {
      sql += ' AND srs.user_id = ?';
      params.push(userId);
    }
    if (riskLevel) {
      sql += ' AND srs.risk_level = ?';
      params.push(riskLevel);
    }

    sql += ' ORDER BY srs.score DESC, srs.calculated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);

    return rows.map(r => ({
      ...r,
      breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : r.breakdown
    }));
  }

  /**
   * List security alerts
   */
  async listAlerts({ sessionId, userId, status, severity, limit = 100, offset = 0 } = {}) {
    let sql = `
      SELECT a.id, a.session_id, a.user_id, a.risk_score, a.title, a.description,
             a.status, a.severity, a.evidence, a.analyst_notes, a.created_at, a.updated_at,
             u.username, u.full_name,
             p.name AS profile_name
      FROM alerts a
      INNER JOIN users u ON a.user_id = u.id
      INNER JOIN db_sessions ds ON a.session_id = ds.id
      INNER JOIN access_profiles p ON ds.profile_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (sessionId) {
      sql += ' AND a.session_id = ?';
      params.push(sessionId);
    }
    if (userId) {
      sql += ' AND a.user_id = ?';
      params.push(userId);
    }
    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }
    if (severity) {
      sql += ' AND a.severity = ?';
      params.push(severity);
    }

    sql += ' ORDER BY a.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);

    return rows.map(r => ({
      ...r,
      evidence: typeof r.evidence === 'string' ? JSON.parse(r.evidence) : r.evidence
    }));
  }

  /**
   * Update alert lifecycle status
   */
  async updateAlertStatus(alertId, status, notes = null) {
    let sql = `UPDATE alerts SET status = ?`;
    const params = [status];

    if (notes !== null) {
      sql += `, analyst_notes = ?`;
      params.push(notes);
    }

    sql += ` WHERE id = ?`;
    params.push(alertId);

    const [res] = await pool.query(sql, params);
    return res.affectedRows > 0;
  }
}

export const riskEngineService = new RiskEngineService();
