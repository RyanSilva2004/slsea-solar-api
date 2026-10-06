// §10 Tooling routes
import express from 'express';
import { health } from '../controllers/tooling.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });

router.route('/').get(health).all(methodNotAllowed(['GET']));

export default router;
