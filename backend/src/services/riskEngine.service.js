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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check if an open or investigating alert already exists for this session with row-lock
      const [existingAlerts] = await conn.query(
        `SELECT id, status FROM alerts
         WHERE session_id = ? AND status IN ('open', 'investigating')
         LIMIT 1 FOR UPDATE`,
        [session.id]
      );

      if (existingAlerts.length > 0) {
        // Alert already exists and is active; update current score and evidence
        await conn.query(
          `UPDATE alerts SET risk_score = ?, severity = ?, evidence = ? WHERE id = ?`,
          [score, riskLevel, JSON.stringify(breakdown), existingAlerts[0].id]
        );
        await conn.commit();
        return;
      }

      // Build alert title & description from fired detector explanations
      const rulesFired = breakdown.map(b => b.rule_id).join(', ');
      const title = `Insider Threat Risk Spike on Session #${session.id} (${riskLevel.toUpperCase()} - Score: ${score})`;
      const description = `Detectors triggered: [${rulesFired}]. Total calculated risk score reached ${score}/100. Immediate analyst review recommended.`;

      const [alertRes] = await conn.query(
        `INSERT INTO alerts (session_id, user_id, risk_score, title, description, status, severity, evidence)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
        [session.id, session.user_id, score, title, description, riskLevel, JSON.stringify(breakdown)]
      );

      await conn.commit();

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
    } catch (err) {
      await conn.rollback();
      logger.error({ err, sessionId: session.id }, 'Error during alert generation');
    } finally {
      conn.release();
    }
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
      LEFT JOIN db_sessions ds ON srs.session_id = ds.id
      LEFT JOIN users u ON srs.user_id = u.id
      LEFT JOIN access_profiles p ON ds.profile_id = p.id
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
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN db_sessions ds ON a.session_id = ds.id
      LEFT JOIN access_profiles p ON ds.profile_id = p.id
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
    const normalizedStatus = status === 'resolved' ? 'closed' : status;
    let sql = `UPDATE alerts SET status = ?`;
    const params = [normalizedStatus];

    if (notes !== null) {
      sql += `, analyst_notes = ?`;
      params.push(notes);
    }

    sql += ` WHERE id = ?`;
    params.push(alertId);

    const [res] = await pool.query(sql, params);
    return res.affectedRows > 0;
  }

  /**
   * Directly derive live security monitoring metrics from persisted MySQL records
   */
  async getMonitoringStats() {
    const [[openAlertsRow]] = await pool.query(
      `SELECT count(*) as count FROM alerts WHERE status = 'open'`
    );
    const [[critAlertsRow]] = await pool.query(
      `SELECT count(*) as count FROM alerts WHERE status = 'open' AND severity IN ('critical', 'high')`
    );
    const [[critViolsRow]] = await pool.query(
      `SELECT count(*) as count FROM policy_violations WHERE severity IN ('critical', 'high')`
    );
    const [[violsRow]] = await pool.query(`
      SELECT 
        count(*) as total,
        sum(CASE WHEN enforcement_type IN ('blocked_pre_execution', 'blocked_by_db') THEN 1 ELSE 0 END) as blocked_pre_exec,
        sum(CASE WHEN enforcement_type = 'detected_post_hoc' THEN 1 ELSE 0 END) as detected_post_hoc
      FROM policy_violations
    `);
    const [[sessionsRow]] = await pool.query(`
      SELECT 
        count(*) as total_sessions,
        sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_sessions
      FROM db_sessions
    `);
    const [[atRiskRow]] = await pool.query(`
      SELECT count(DISTINCT ds.id) as count
      FROM db_sessions ds
      JOIN session_risk_scores srs ON ds.id = srs.session_id
      WHERE ds.status = 'active' AND srs.score >= 40
    `);
    const [[allAtRiskRow]] = await pool.query(`
      SELECT count(DISTINCT session_id) as count
      FROM session_risk_scores
      WHERE score >= 40
    `);

    const openAlertsCount = Number(openAlertsRow?.count || 0);
    const critAlertsCount = Number(critAlertsRow?.count || 0);
    const critViolsCount = Number(critViolsRow?.count || 0);
    const totalViolationsCount = Number(violsRow?.total || 0);
    const blockedPreExecCount = Number(violsRow?.blocked_pre_exec || 0);
    const detectedPostHocCount = Number(violsRow?.detected_post_hoc || 0);
    const activeSessionsCount = Number(sessionsRow?.active_sessions || 0);
    const totalSessionsCount = Number(sessionsRow?.total_sessions || 0);
    const sessionsAtRiskCount = Number(atRiskRow?.count || 0);
    const allSessionsAtRiskCount = Number(allAtRiskRow?.count || 0);

    return {
      open_alerts_count: openAlertsCount,
      critical_high_count: critAlertsCount + critViolsCount,
      total_violations_count: totalViolationsCount,
      blocked_pre_exec_count: blockedPreExecCount,
      detected_post_hoc_count: detectedPostHocCount,
      sessions_at_risk_count: sessionsAtRiskCount,
      all_sessions_at_risk_count: allSessionsAtRiskCount,
      active_sessions_count: activeSessionsCount,
      total_sessions_count: totalSessionsCount
    };
  }
}

export const riskEngineService = new RiskEngineService();
