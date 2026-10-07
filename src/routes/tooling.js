// §10 Tooling routes
import express from 'express';
import { health, openapi, docsRedirect, docsAssets, docsPage } from '../controllers/tooling.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';
import notFound from '../middleware/not-found.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });

router.route('/').get(health).all(methodNotAllowed(['GET']));
router.route('/solar/v1.0/openapi').get(openapi).all(methodNotAllowed(['GET']));
router.route('/solar/v1.0/docs').get(docsRedirect).all(methodNotAllowed(['GET']));
router.route('/solar/v1.0/docs/').get(docsPage).all(methodNotAllowed(['GET']));
// §6.10: swagger-ui-express answers this file with a plain-text 404
router.all('/solar/v1.0/docs/package.json', notFound);
router.use('/solar/v1.0/docs', docsAssets);

export default router;
