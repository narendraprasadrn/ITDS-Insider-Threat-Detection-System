// backend/src/services/profile.service.js
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';

export const profileService = {
  /**
   * Helper to format profile objects with attached resources and roles
   */
  async hydrateProfiles(profileRows) {
    if (profileRows.length === 0) return [];
    const profileIds = profileRows.map(p => p.id);

    // Fetch resources mapped to these profiles
    const [resourceRows] = await pool.query(
      `SELECT pr.profile_id, r.id, r.db_name, r.table_name, r.sensitivity, r.description
       FROM profile_resources pr
       JOIN resources r ON pr.resource_id = r.id
       WHERE pr.profile_id IN (?)`,
      [profileIds]
    );

    // Fetch roles permitted to use these profiles
    const [roleRows] = await pool.query(
      `SELECT rp.profile_id, r.id AS role_id, r.name AS role_name
       FROM role_profiles rp
       JOIN roles r ON rp.role_id = r.id
       WHERE rp.profile_id IN (?)`,
      [profileIds]
    );

    const resourcesMap = {};
    for (const res of resourceRows) {
      if (!resourcesMap[res.profile_id]) resourcesMap[res.profile_id] = [];
      resourcesMap[res.profile_id].push({
        id: res.id,
        db_name: res.db_name,
        table_name: res.table_name,
        sensitivity: res.sensitivity,
        description: res.description
      });
    }

    const rolesMap = {};
    for (const r of roleRows) {
      if (!rolesMap[r.profile_id]) rolesMap[r.profile_id] = [];
      rolesMap[r.profile_id].push({
        id: r.role_id,
        name: r.role_name
      });
    }

    return profileRows.map(p => ({
      ...p,
      allowed_operations: typeof p.allowed_operations === 'string'
        ? JSON.parse(p.allowed_operations)
        : p.allowed_operations,
      requires_approval: Boolean(p.requires_approval),
      resources: resourcesMap[p.id] || [],
      roles: rolesMap[p.id] || []
    }));
  },

  async listProfiles() {
    const [rows] = await pool.query(
      `SELECT id, name, description, allowed_operations, max_duration_minutes, max_rows_hint,
              risk_level, requires_approval, created_at, updated_at
       FROM access_profiles ORDER BY id ASC`
    );
    return await this.hydrateProfiles(rows);
  },

  async getProfile(id) {
    const [rows] = await pool.execute(
      `SELECT id, name, description, allowed_operations, max_duration_minutes, max_rows_hint,
              risk_level, requires_approval, created_at, updated_at
       FROM access_profiles WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      throw new AppError('Access profile not found', 404, 'NOT_FOUND');
    }
    const hydrated = await this.hydrateProfiles(rows);
    return hydrated[0];
  },

  /**
   * Return profiles available to the specified user based on their roles
   */
  async getAvailableProfilesForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT ap.id, ap.name, ap.description, ap.allowed_operations,
              ap.max_duration_minutes, ap.max_rows_hint, ap.risk_level, ap.requires_approval,
              ap.created_at, ap.updated_at
       FROM access_profiles ap
       JOIN role_profiles rp ON ap.id = rp.profile_id
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY ap.id ASC`,
      [userId]
    );
    return await this.hydrateProfiles(rows);
  },

  async createProfile({
    name,
    description,
    allowed_operations = ['SELECT'],
    max_duration_minutes = 60,
    max_rows_hint = 1000,
    risk_level = 'low',
    requires_approval = false,
    resource_ids = [],
    role_ids = []
  }) {
    if (!name || !description) {
      throw new AppError('Profile name and description are required', 400, 'BAD_REQUEST');
    }

    const [existing] = await pool.execute(`SELECT id FROM access_profiles WHERE name = ? LIMIT 1`, [name]);
    if (existing.length > 0) {
      throw new AppError(`Access profile '${name}' already exists`, 409, 'CONFLICT');
    }

    const operationsJson = JSON.stringify(allowed_operations);

    const [result] = await pool.execute(
      `INSERT INTO access_profiles (name, description, allowed_operations, max_duration_minutes, max_rows_hint, risk_level, requires_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, description, operationsJson, max_duration_minutes, max_rows_hint, risk_level, requires_approval]
    );

    const profileId = result.insertId;

    // Attach resources
    if (resource_ids && resource_ids.length > 0) {
      for (const resId of resource_ids) {
        await pool.execute(
          `INSERT INTO profile_resources (profile_id, resource_id) VALUES (?, ?)`,
          [profileId, resId]
        );
      }
    }

    // Attach roles
    if (role_ids && role_ids.length > 0) {
      for (const roleId of role_ids) {
        await pool.execute(
          `INSERT INTO role_profiles (role_id, profile_id) VALUES (?, ?)`,
          [roleId, profileId]
        );
      }
    }

    return await this.getProfile(profileId);
  },

  async updateProfile(id, {
    name,
    description,
    allowed_operations,
    max_duration_minutes,
    max_rows_hint,
    risk_level,
    requires_approval,
    resource_ids,
    role_ids
  }) {
    await this.getProfile(id);

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (allowed_operations !== undefined) {
      updates.push('allowed_operations = ?');
      params.push(JSON.stringify(allowed_operations));
    }
    if (max_duration_minutes !== undefined) {
      updates.push('max_duration_minutes = ?');
      params.push(max_duration_minutes);
    }
    if (max_rows_hint !== undefined) {
      updates.push('max_rows_hint = ?');
      params.push(max_rows_hint);
    }
    if (risk_level !== undefined) {
      updates.push('risk_level = ?');
      params.push(risk_level);
    }
    if (requires_approval !== undefined) {
      updates.push('requires_approval = ?');
      params.push(requires_approval);
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(`UPDATE access_profiles SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (resource_ids !== undefined && Array.isArray(resource_ids)) {
      await pool.execute(`DELETE FROM profile_resources WHERE profile_id = ?`, [id]);
      for (const resId of resource_ids) {
        await pool.execute(`INSERT INTO profile_resources (profile_id, resource_id) VALUES (?, ?)`, [id, resId]);
      }
    }

    if (role_ids !== undefined && Array.isArray(role_ids)) {
      await pool.execute(`DELETE FROM role_profiles WHERE profile_id = ?`, [id]);
      for (const roleId of role_ids) {
        await pool.execute(`INSERT INTO role_profiles (role_id, profile_id) VALUES (?, ?)`, [roleId, id]);
      }
    }

    return await this.getProfile(id);
  },

  async deleteProfile(id) {
    await this.getProfile(id);
    await pool.execute(`DELETE FROM access_profiles WHERE id = ?`, [id]);
    return { success: true, message: `Access profile ${id} deleted` };
  }
};
