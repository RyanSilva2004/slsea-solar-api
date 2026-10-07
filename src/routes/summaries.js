// EP5 generation summaries
import express from 'express';
import * as summaries from '../controllers/summaries.js';
import authenticate from '../middleware/authenticate.js';
import requireScope from '../middleware/require-scope.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });
const read = [authenticate, requireScope('generation:read')];

router
  .route('/districts/:id/generation-summary')
  .get(read, summaries.getDistrictSummary)
  .all(methodNotAllowed(['GET']));

router
  .route('/provinces/:id/generation-summary')
  .get(read, summaries.getProvinceSummary)
  .all(methodNotAllowed(['GET']));

router
  .route('/generation-summary')
  .get(read, summaries.getNationalSummary)
  .all(methodNotAllowed(['GET']));

export default router;
