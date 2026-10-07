// EP9 last-known reading, EP10 readings, EP11 reading member
import express from 'express';
import * as readings from '../controllers/readings.js';
import authenticate from '../middleware/authenticate.js';
import requireScope from '../middleware/require-scope.js';
import { readingsLimiter } from '../middleware/rate-limit.js';
import jsonBody from '../middleware/json-body.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });
const read = [authenticate, requireScope('generation:read')];

router
  .route('/installations/:id/readings')
  .get(read, readings.listReadings)
  // §9 EP10: authenticate → requireScope → readingsLimiter → json-body
  .post(authenticate, requireScope('readings:write'), readingsLimiter, jsonBody, readings.createReading)
  .all(methodNotAllowed(['GET', 'POST']));

router
  .route('/installations/:id/readings/:readingId')
  .get(read, readings.getReading)
  .all(methodNotAllowed(['GET']));

router
  .route('/installations/:id/last-known-reading')
  .get(read, readings.getLastKnownReading)
  .all(methodNotAllowed(['GET']));

export default router;
