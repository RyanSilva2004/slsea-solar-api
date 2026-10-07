// EP17 region readings
import express from 'express';
import * as regionReadings from '../controllers/region-readings.js';
import authenticate from '../middleware/authenticate.js';
import requireScope from '../middleware/require-scope.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });
const read = [authenticate, requireScope('generation:read')];

router
  .route('/districts/:id/readings')
  .get(read, regionReadings.listDistrictReadings)
  .all(methodNotAllowed(['GET']));

router
  .route('/provinces/:id/readings')
  .get(read, regionReadings.listProvinceReadings)
  .all(methodNotAllowed(['GET']));

export default router;
