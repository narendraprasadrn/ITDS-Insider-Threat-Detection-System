// backend/src/controllers/user.controller.js
import { userService } from '../services/user.service.js';

export const userController = {
  async listUsers(req, res, next) {
    try {
      const users = await userService.listUsers();
      res.status(200).json({
        success: true,
        data: { users }
      });
    } catch (err) {
      next(err);
    }
  },

  async getUser(req, res, next) {
    try {
      const user = await userService.getUser(req.params.id);
      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (err) {
      next(err);
    }
  },

  async createUser(req, res, next) {
    try {
      const user = await userService.createUser(req.body);
      res.status(201).json({
        success: true,
        data: { user }
      });
    } catch (err) {
      next(err);
    }
  },

  async updateUser(req, res, next) {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(req, res, next) {
    try {
      const result = await userService.deleteUser(req.params.id);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
