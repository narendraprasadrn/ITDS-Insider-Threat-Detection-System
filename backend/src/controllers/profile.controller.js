// backend/src/controllers/profile.controller.js
import { profileService } from '../services/profile.service.js';

export const profileController = {
  async listProfiles(req, res, next) {
    try {
      const profiles = await profileService.listProfiles();
      res.status(200).json({ success: true, data: { profiles } });
    } catch (err) {
      next(err);
    }
  },

  async getProfile(req, res, next) {
    try {
      const profile = await profileService.getProfile(req.params.id);
      res.status(200).json({ success: true, data: { profile } });
    } catch (err) {
      next(err);
    }
  },

  async getAvailableProfiles(req, res, next) {
    try {
      const profiles = await profileService.getAvailableProfilesForUser(req.user.id);
      res.status(200).json({ success: true, data: { profiles } });
    } catch (err) {
      next(err);
    }
  },

  async createProfile(req, res, next) {
    try {
      const profile = await profileService.createProfile(req.body);
      res.status(201).json({ success: true, data: { profile } });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const profile = await profileService.updateProfile(req.params.id, req.body);
      res.status(200).json({ success: true, data: { profile } });
    } catch (err) {
      next(err);
    }
  },

  async deleteProfile(req, res, next) {
    try {
      const result = await profileService.deleteProfile(req.params.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
};
