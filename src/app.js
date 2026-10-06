import express from 'express';
import toolingRouter from './routes/tooling.js';

const app = express();

// §6.1
app.set('strict routing', true);
app.set('case sensitive routing', true);
app.set('etag', false);
app.set('x-powered-by', false);

app.use(toolingRouter);

export default app;
