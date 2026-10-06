// §7.4 (§6.2 step 4)
import { ApiError } from '../lib/errors.js';
import { verifyToken, roleScopes, DEVICE_SCOPES } from '../lib/tokens.js';
import { areaOf } from '../lib/geography.js';
import User from '../models/user.js';
import Installation from '../models/installation.js';

const BEARER = /^Bearer ([^\s]+)$/i;

function invalidToken(message) {
  return new ApiError(40102, message, {
    headers: { 'WWW-Authenticate': 'Bearer realm="solar", error="invalid_token"' },
  });
}

function intersect(tokenScopes, allowed) {
  return tokenScopes.filter((scope) => allowed.includes(scope));
}

async function userPrincipal(claims, tokenScopes) {
  const user = await User.findOne({ user_id: claims.sub }).lean();
  if (!user || claims.ver !== user.password_changed_at.getTime()) {
    throw invalidToken('The token has been revoked or its user no longer exists.');
  }
  return { type: 'user', user, scopes: intersect(tokenScopes, roleScopes(user.role)), area: areaOf(user) };
}

async function devicePrincipal(claims, tokenScopes) {
  const installation = await Installation.findOne({ installation_id: claims.sub }).lean();
  if (
    !installation ||
    installation.status !== 'ACTIVE' ||
    !installation.device_secret_issued_at ||
    claims.ver !== installation.device_secret_issued_at.getTime()
  ) {
    throw invalidToken('The token has been revoked or its installation is no longer active.');
  }
  return { type: 'device', installation, scopes: intersect(tokenScopes, DEVICE_SCOPES) };
}

export default async function authenticate(req, res, next) {
  const match = BEARER.exec(req.get('Authorization') ?? '');
  if (!match) {
    throw new ApiError(40101, 'A bearer token is required.', {
      headers: { 'WWW-Authenticate': 'Bearer realm="solar"' },
    });
  }
  const claims = verifyToken(match[1]);
  if (!claims) {
    throw invalidToken('The bearer token is invalid or expired.');
  }
  const tokenScopes = claims.scope.split(' ').filter(Boolean);
  req.principal =
    claims.typ === 'user' ? await userPrincipal(claims, tokenScopes) : await devicePrincipal(claims, tokenScopes);
  next();
}
