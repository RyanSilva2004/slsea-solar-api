import express from 'express';
import origin from './middleware/origin.js';
import negotiation from './middleware/negotiation.js';
import notFound from './middleware/not-found.js';
import errorHandler from './middleware/error-handler.js';
import toolingRouter from './routes/tooling.js';
import tokenRouter from './routes/token.js';

const app = express();

// §6.1
app.set('strict routing', true);
app.set('case sensitive routing', true);
app.set('etag', false);
app.set('x-powered-by', false);

// §6.2 pipeline order
app.use(origin);
app.use(toolingRouter);
app.use(negotiation);
// API routers (§3.1)
app.use('/solar/v1.0', tokenRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
