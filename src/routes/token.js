// EP1 /token (§7.2, §7.11)
import express from 'express';
import { formBody, issueToken } from '../controllers/token.js';
import { tokenLimiter } from '../middleware/rate-limit.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });

router.route('/token').post(formBody, tokenLimiter, issueToken).all(methodNotAllowed(['POST']));

export default router;
