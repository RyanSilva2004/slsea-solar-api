// §7.11 Rate limits (§6.2 step 7)
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { readBasic } from '../lib/secrets.js';

function retryAfterSeconds(req) {
  const resetTime = req.rateLimit.resetTime;
  const seconds = resetTime ? Math.ceil((resetTime.getTime() - Date.now()) / 1000) : 0;
  return Math.max(1, seconds);
}

function limiter(name, { windowMs, limit, keyGenerator, skip, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skip,
    skipSuccessfulRequests,
    standardHeaders: false,
    legacyHeaders: false,
    validate: false,
    handler(req, res, next) {
      audit('rate_limited', { limiter: name, key: keyGenerator(req) });
      next(
        new ApiError(42901, 'Too many requests. Try again later.', {
          headers: { 'Retry-After': String(retryAfterSeconds(req)) },
        }),
      );
    },
  });
}

// §7.11: password:<username> · device:<installation_id> · null (not counted)
function tokenKey(req) {
  const { grant_type: grantType, username } = req.body;
  if (grantType === 'password' && typeof username === 'string' && username !== '') {
    return `password:${username}`;
  }
  if (grantType === 'client_credentials') {
    const credentials = readBasic(req.get('Authorization'));
    if (credentials) {
      return `device:${credentials.id}`;
    }
  }
  return null;
}

export const tokenLimiter = limiter('tokenLimiter', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: tokenKey,
  skip: (req) => tokenKey(req) === null,
  skipSuccessfulRequests: true,
});

// §7.11: a successful token response resets the count for its key
export function resetTokenLimit(req) {
  return tokenLimiter.resetKey(tokenKey(req));
}
