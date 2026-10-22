// backend/src/services/resource.service.js
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';

export const resourceService = {
  async listResources() {
    const [rows] = await pool.query(
      `SELECT id, db_name, table_name, sensitivity, description, created_at, updated_at
       FROM resources ORDER BY db_name ASC, table_name ASC`
    );
    return rows;
  },

  async getResource(id) {
    const [rows] = await pool.execute(
      `SELECT id, db_name, table_name, sensitivity, description, created_at, updated_at
       FROM resources WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      throw new AppError('Resource not found', 404, 'NOT_FOUND');
    }
    return rows[0];
  },

  async createResource({ db_name = 'target_db', table_name, sensitivity = 'low', description = '' }) {
    if (!table_name) {
      throw new AppError('Table name is required', 400, 'BAD_REQUEST');
    }

    const validSensitivities = ['low', 'medium', 'high', 'critical'];
    if (!validSensitivities.includes(sensitivity)) {
      throw new AppError(`Invalid sensitivity: must be one of [${validSensitivities.join(', ')}]`, 400, 'BAD_REQUEST');
    }

    const [existing] = await pool.execute(
      `SELECT id FROM resources WHERE db_name = ? AND table_name = ? LIMIT 1`,
      [db_name, table_name]
    );
    if (existing.length > 0) {
      throw new AppError(`Resource ${db_name}.${table_name} already exists`, 409, 'CONFLICT');
    }

    const [result] = await pool.execute(
      `INSERT INTO resources (db_name, table_name, sensitivity, description) VALUES (?, ?, ?, ?)`,
      [db_name, table_name, sensitivity, description]
    );

    return await this.getResource(result.insertId);
  },

  async updateResource(id, { sensitivity, description }) {
    await this.getResource(id);

    const updates = [];
    const params = [];

    if (sensitivity !== undefined) {
      const validSensitivities = ['low', 'medium', 'high', 'critical'];
      if (!validSensitivities.includes(sensitivity)) {
        throw new AppError(`Invalid sensitivity: must be one of [${validSensitivities.join(', ')}]`, 400, 'BAD_REQUEST');
      }
      updates.push('sensitivity = ?');
      params.push(sensitivity);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(`UPDATE resources SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return await this.getResource(id);
  },

  async deleteResource(id) {
    await this.getResource(id);
    await pool.execute(`DELETE FROM resources WHERE id = ?`, [id]);
    return { success: true, message: `Resource ${id} deleted` };
  }
};
