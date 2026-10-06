// §7.2 POST /token
import express from 'express';
import { ApiError } from '../lib/errors.js';
import { signToken, roleScopes, DEVICE_SCOPES, TOKEN_LIFETIME } from '../lib/tokens.js';
import { checkPassword, deviceSecretMatches, readBasic } from '../lib/secrets.js';
import { audit } from '../lib/audit.js';
import { resetTokenLimit } from '../middleware/rate-limit.js';
import User from '../models/user.js';
import Installation from '../models/installation.js';

const parseForm = express.urlencoded({ extended: false, limit: '16kb' });

// §7.2, §7.12: every 40103 writes one token_rejected line
function invalidCredentials(message, grant, subject) {
  audit('token_rejected', { grant, subject });
  return new ApiError(40103, message, { headers: { 'WWW-Authenticate': 'Basic realm="solar"' } });
}

// §6.11
export function noStore(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
}

export function formBody(req, res, next) {
  if (!req.is('application/x-www-form-urlencoded')) {
    return next(new ApiError(41501, 'Content-Type must be application/x-www-form-urlencoded.'));
  }
  parseForm(req, res, (err) => {
    if (!err) {
      req.body ??= {};
      return next();
    }
    if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
      return next(new ApiError(41501, 'Unsupported charset or content encoding.'));
    }
    if (err.type === 'entity.too.large' || err.type === 'parameters.too.many') {
      return next(new ApiError(40001, 'The form body is larger than 16kb.'));
    }
    next(err);
  });
}

function requiredField(body, name) {
  const value = body[name];
  if (typeof value !== 'string' || value === '') {
    throw new ApiError(40001, `${name} is required.`, { errors: [{ code: 40001, message: `${name} is required.` }] });
  }
  return value;
}

async function passwordGrant(body) {
  const username = requiredField(body, 'username');
  const password = requiredField(body, 'password');
  const user = await User.findOne({ username }).lean();
  if (!(await checkPassword(password, user?.password_hash))) {
    throw invalidCredentials('The username or password is wrong.', 'password', username);
  }
  return {
    sub: user.user_id,
    typ: 'user',
    scopes: roleScopes(user.role),
    ver: user.password_changed_at.getTime(),
  };
}

async function clientCredentialsGrant(req) {
  const message = 'The device credentials are wrong.';
  const credentials = readBasic(req.get('Authorization'));
  if (!credentials) {
    throw invalidCredentials(message, 'client_credentials', null);
  }
  const installation = await Installation.findOne({ installation_id: credentials.id }).lean();
  if (
    !installation ||
    installation.status !== 'ACTIVE' ||
    !installation.device_secret_hash ||
    !installation.device_secret_issued_at ||
    !deviceSecretMatches(credentials.secret, installation.device_secret_hash)
  ) {
    throw invalidCredentials(message, 'client_credentials', credentials.id);
  }
  return {
    sub: installation.installation_id,
    typ: 'device',
    scopes: DEVICE_SCOPES,
    ver: installation.device_secret_issued_at.getTime(),
  };
}

export async function issueToken(req, res) {
  const grantType = req.body.grant_type;
  let claims;
  if (grantType === 'password') {
    claims = await passwordGrant(req.body);
  } else if (grantType === 'client_credentials') {
    claims = await clientCredentialsGrant(req);
  } else {
    const message = 'grant_type must be password or client_credentials.';
    throw new ApiError(40001, message, { errors: [{ code: 40001, message }] });
  }
  await resetTokenLimit(req);
  res.json({
    access_token: signToken(claims),
    token_type: 'Bearer',
    expires_in: TOKEN_LIFETIME,
    scope: claims.scopes.join(' '),
  });
}
