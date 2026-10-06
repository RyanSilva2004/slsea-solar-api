'use strict';

// Settings come from environment variables (04 AR9).
// Locally they are read from .env (git-ignored) with Node's built-in loader,
// so no dotenv package is needed. Real environment variables take precedence.
const path = require('node:path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err; // no .env file is fine (e.g. CI)
}

const toInt = (value, fallback) =>
  value === undefined || value === '' ? fallback : Number.parseInt(value, 10);

const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const basePath = '/solar/v1.0'; // feature code + major.minor version (03 U2)

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  mongodbUri: process.env.MONGODB_URI || '',
  publicBaseUrl,
  basePath,
  jwt: Object.freeze({
    secret: process.env.JWT_SECRET || '',
    ttlMinutes: toInt(process.env.JWT_TTL_MINUTES, 60),
    issuer: `${publicBaseUrl}${basePath}`,
    audience: 'slsea-solar-api',
  }),
  bootstrapAdmin: Object.freeze({
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'hq.admin',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'SLSEA Head Office Admin',
  }),
  originSecret: process.env.ORIGIN_SECRET || '', // empty = origin guard off (local)
});

// Call from the phase that first needs a setting, e.g. requireSettings('MONGODB_URI') in L2,
// requireSettings('JWT_SECRET', 'BOOTSTRAP_ADMIN_PASSWORD') in L4. Fails fast with a clear message.
function requireSettings(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')} (see .env.example)`);
  }
}

module.exports = { config, requireSettings };
