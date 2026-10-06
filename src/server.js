'use strict';

const { config } = require('./config');
const app = require('./app');

// Phase L2 adds: connect to MongoDB (config.mongodbUri) and sync indexes before listening.
// Phase L4 adds: create hq.admin when the users collection is empty (guide §3.4).

const server = app.listen(config.port, () => {
  console.log(`slsea-solar-api listening on port ${config.port} (${config.env})`);
});

// Graceful shutdown: Ctrl+C, nodemon restarts and `pm2 reload` let in-flight requests finish.
function shutdown(signal) {
  console.log(`${signal} received — closing the server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 4000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
