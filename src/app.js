'use strict';

const express = require('express');

const app = express();

// Design rules set once (03 U3; guide L3).
// Note: these apply to routes declared on `app`. Every express.Router() must be created with
// { strict: true, caseSensitive: true } as well — routers do not inherit them.
app.set('strict routing', true); //         /provinces/ is not /provinces → 404
app.set('case sensitive routing', true); // /Provinces is not /provinces → 404
app.set('etag', false); //                  ETags are made by lib/etag from the body (03 S7), not by Express
app.disable('x-powered-by'); //             do not advertise the framework

// Health check (03 EP16) — used by API Gateway, pm2 checks and the Postman folder "L0 Health".
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'slsea-solar-api' });
});

// From phase L3 (guide §6.1), in this fixed order (03 M2; 04 §3.1):
//   0. origin guard (production only)      → middleware/origin
//   1. content negotiation (Accept)        → middleware/negotiation
//   2. routers mounted at config.basePath  → routes/*  (auth + scope per route)
//   3. 404 for unknown paths               → error body 40401
//   4. error handler (guide §5.2 body)     → middleware/errors

module.exports = app;
