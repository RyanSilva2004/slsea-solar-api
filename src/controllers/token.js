// §7.2 POST /token
import express from 'express';
import { ApiError } from '../lib/errors.js';
import { signToken, roleScopes, DEVICE_SCOPES, TOKEN_LIFETIME } from '../lib/tokens.js';
import { checkPassword, deviceSecretMatches } from '../lib/secrets.js';
import User from '../models/user.js';
import Installation from '../models/installation.js';

const parseForm = express.urlencoded({ extended: false });

function invalidCredentials(message) {
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
      return next(new ApiError(40001, 'The form body is too large.'));
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
  if (!user || !(await checkPassword(password, user.password_hash))) {
    throw invalidCredentials('The username or password is wrong.');
  }
  return {
    sub: user.user_id,
    typ: 'user',
    scopes: roleScopes(user.role),
    ver: user.password_changed_at.getTime(),
  };
}

// Authorization: Basic base64(installation_id:device_secret)
function readBasic(header) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? '');
  if (!match) {
    return null;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 1 || colon === decoded.length - 1) {
    return null;
  }
  return { id: decoded.slice(0, colon), secret: decoded.slice(colon + 1) };
}

async function clientCredentialsGrant(req) {
  const message = 'The device credentials are wrong.';
  const credentials = readBasic(req.get('Authorization'));
  if (!credentials) {
    throw invalidCredentials(message);
  }
  const installation = await Installation.findOne({ installation_id: credentials.id }).lean();
  if (
    !installation ||
    installation.status !== 'ACTIVE' ||
    !installation.device_secret_hash ||
    !installation.device_secret_issued_at ||
    !deviceSecretMatches(credentials.secret, installation.device_secret_hash)
  ) {
    throw invalidCredentials(message);
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
  res.json({
    access_token: signToken(claims),
    token_type: 'Bearer',
    expires_in: TOKEN_LIFETIME,
    scope: claims.scopes.join(' '),
  });
}
