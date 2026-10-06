import express from 'express';
import securityHeaders from './middleware/security-headers.js';
import origin from './middleware/origin.js';
import negotiation from './middleware/negotiation.js';
import notFound from './middleware/not-found.js';
import errorHandler from './middleware/error-handler.js';
import toolingRouter from './routes/tooling.js';
import tokenRouter from './routes/token.js';
import geographyRouter from './routes/geography.js';
import usersRouter from './routes/users.js';
import installationsRouter from './routes/installations.js';

const app = express();

// §6.1
app.set('strict routing', true);
app.set('case sensitive routing', true);
app.set('etag', false);
app.set('x-powered-by', false);

// §6.2 pipeline order
app.use(securityHeaders);
app.use(origin);
app.use(toolingRouter);
app.use(negotiation);
// API routers (§3.1)
app.use('/solar/v1.0', tokenRouter);
app.use('/solar/v1.0', geographyRouter);
app.use('/solar/v1.0', usersRouter);
app.use('/solar/v1.0', installationsRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
