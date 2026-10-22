// backend/src/controllers/resource.controller.js
import { resourceService } from '../services/resource.service.js';

export const resourceController = {
  async listResources(req, res, next) {
    try {
      const resources = await resourceService.listResources();
      res.status(200).json({ success: true, data: { resources } });
    } catch (err) {
      next(err);
    }
  },

  async getResource(req, res, next) {
    try {
      const resource = await resourceService.getResource(req.params.id);
      res.status(200).json({ success: true, data: { resource } });
    } catch (err) {
      next(err);
    }
  },

  async createResource(req, res, next) {
    try {
      const resource = await resourceService.createResource(req.body);
      res.status(201).json({ success: true, data: { resource } });
    } catch (err) {
      next(err);
    }
  },

  async updateResource(req, res, next) {
    try {
      const resource = await resourceService.updateResource(req.params.id, req.body);
      res.status(200).json({ success: true, data: { resource } });
    } catch (err) {
      next(err);
    }
  },

  async deleteResource(req, res, next) {
    try {
      const result = await resourceService.deleteResource(req.params.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
};
