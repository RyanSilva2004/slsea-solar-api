// §4 Environment variables

function fail(message) {
  console.error(`Configuration error: ${message}`);
  process.exit(1);
}

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    fail(`${name} is required.`);
  }
  return value.trim();
}

function readPort() {
  const text = required('PORT');
  const port = Number(text);
  if (!/^[0-9]+$/.test(text) || port < 1 || port > 65535) {
    fail('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function readMongoUri() {
  const uri = required('MONGODB_URI');
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    fail('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }
  return uri;
}

function readPublicBaseUrl() {
  const url = required('PUBLIC_BASE_URL');
  if (!URL.canParse(url) || !/^https?:\/\//.test(url)) {
    fail('PUBLIC_BASE_URL must be an absolute http(s) URL.');
  }
  if (url.endsWith('/')) {
    fail('PUBLIC_BASE_URL must not end with a slash.');
  }
  return url;
}

function readJwtSecret() {
  const secret = required('JWT_SECRET');
  if (secret.length < 32) {
    fail('JWT_SECRET must be at least 32 characters.');
  }
  return secret;
}

const config = {
  port: readPort(),
  mongodbUri: readMongoUri(),
  publicBaseUrl: readPublicBaseUrl(),
  jwtSecret: readJwtSecret(),
  bootstrapAdminUsername: process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || 'hq.admin',
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  originSecret: process.env.ORIGIN_SECRET || '',
};

export default config;
