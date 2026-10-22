// backend/src/controllers/sse.controller.js
import { sseService } from '../services/sse.service.js';

export const sseController = {
  stream(req, res) {
    sseService.addClient(res, req.user);
  }
};
