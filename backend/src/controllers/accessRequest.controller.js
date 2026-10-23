// backend/src/controllers/accessRequest.controller.js
import { accessRequestService } from '../services/accessRequest.service.js';

export const accessRequestController = {
  async createRequest(req, res, next) {
    try {
      const {
        request_type,
        target_table,
        operations,
        profile_id,
        requested_duration_minutes,
        justification,
        time_of_day,
        replace_existing,
        replaceExisting
      } = req.body;
      let result;

      if (request_type === 'table' || target_table) {
        result = await accessRequestService.createTableRequest({
          user: req.user,
          targetTable: target_table,
          operations,
          requestedDurationMinutes: requested_duration_minutes,
          justification,
          timeOfDay: time_of_day,
          req
        });
      } else {
        result = await accessRequestService.createRequest({
          user: req.user,
          profileId: profile_id,
          requestedDurationMinutes: requested_duration_minutes,
          justification,
          timeOfDay: time_of_day,
          replaceExisting: Boolean(replace_existing || replaceExisting),
          req
        });
      }

      const statusCode = result.status === 'active' || result.status === 'approved' ? 201 : 200;
      res.status(statusCode).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  async listRequests(req, res, next) {
    try {
      const { status, limit, offset } = req.query;
      const requests = await accessRequestService.listRequests({
        user: req.user,
        status,
        limit,
        offset
      });

      res.status(200).json({
        success: true,
        data: { requests }
      });
    } catch (err) {
      next(err);
    }
  },

  async getRequestById(req, res, next) {
    try {
      const request = await accessRequestService.getRequestById(req.params.id, req.user);
      res.status(200).json({
        success: true,
        data: { request }
      });
    } catch (err) {
      next(err);
    }
  },

  async listPending(req, res, next) {
    try {
      const pending = await accessRequestService.listPendingRequests();
      res.status(200).json({
        success: true,
        data: { requests: pending }
      });
    } catch (err) {
      next(err);
    }
  },

  async approveRequest(req, res, next) {
    try {
      const { comments } = req.body;
      const result = await accessRequestService.approveRequest(req.params.id, req.user, comments);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  async denyRequest(req, res, next) {
    try {
      const { comments } = req.body;
      const result = await accessRequestService.denyRequest(req.params.id, req.user, comments);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
