// EP6 /installations, EP7 /installations/{installation-id}, EP8 overview, EP12 device credential
import express from 'express';
import * as installations from '../controllers/installations.js';
import authenticate from '../middleware/authenticate.js';
import requireScope from '../middleware/require-scope.js';
import jsonBody from '../middleware/json-body.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });
const read = [authenticate, requireScope('generation:read')];
const write = [authenticate, requireScope('installations:write')];

router
  .route('/installations')
  .get(read, installations.listInstallations)
  .post(write, jsonBody, installations.createInstallation)
  .all(methodNotAllowed(['GET', 'POST']));

router
  .route('/installations/:id')
  .get(read, installations.getInstallation)
  .put(write, jsonBody, installations.replaceInstallation)
  .delete(write, installations.deleteInstallation)
  .all(methodNotAllowed(['GET', 'PUT', 'DELETE']));

router
  .route('/installations/:id/overview')
  .get(read, installations.getOverview)
  .all(methodNotAllowed(['GET']));

router
  .route('/installations/:id/device-credential')
  .post(authenticate, requireScope('credentials:issue'), installations.issueCredential)
  .all(methodNotAllowed(['POST']));

export default router;
