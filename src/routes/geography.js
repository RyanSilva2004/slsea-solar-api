// EP2 /provinces, EP3 /districts, EP4 /substations
import express from 'express';
import * as geography from '../controllers/geography.js';
import authenticate from '../middleware/authenticate.js';
import requireScope from '../middleware/require-scope.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });
const read = [authenticate, requireScope('geography:read')];

router.route('/provinces').get(read, geography.listProvinces).all(methodNotAllowed(['GET']));
router.route('/provinces/:id').get(read, geography.getProvince).all(methodNotAllowed(['GET']));
router.route('/districts').get(read, geography.listDistricts).all(methodNotAllowed(['GET']));
router.route('/districts/:id').get(read, geography.getDistrict).all(methodNotAllowed(['GET']));
router.route('/substations').get(read, geography.listSubstations).all(methodNotAllowed(['GET']));
router.route('/substations/:id').get(read, geography.getSubstation).all(methodNotAllowed(['GET']));

export default router;
