// §7.1 Scopes, §7.3 JWT
import jwt from 'jsonwebtoken';
import config from '../config.js';

const ISSUER = 'slsea-solar-api';
const AUDIENCE = 'slsea-solar-api';
export const TOKEN_LIFETIME = 3600;

// §7.1
const ROLE_SCOPES = {
  ANALYST: ['geography:read', 'generation:read', 'account:write'],
  INSTALLATION_OFFICER: [
    'geography:read',
    'generation:read',
    'installations:write',
    'credentials:issue',
    'account:write',
  ],
  ADMIN: ['geography:read', 'users:manage', 'account:write'],
};
export const DEVICE_SCOPES = ['readings:write'];

export function roleScopes(role) {
  return ROLE_SCOPES[role] ?? [];
}

export function signToken({ sub, typ, scopes, ver }) {
  return jwt.sign({ typ, scope: scopes.join(' '), ver }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_LIFETIME,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: sub,
  });
}

function hasClaims(claims) {
  return (
    typeof claims.sub === 'string' &&
    (claims.typ === 'user' || claims.typ === 'device') &&
    typeof claims.scope === 'string' &&
    typeof claims.ver === 'number' &&
    typeof claims.iat === 'number' &&
    typeof claims.exp === 'number'
  );
}

// Returns the claims, or null when the token is not valid
export function verifyToken(token) {
  try {
    const claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return hasClaims(claims) ? claims : null;
  } catch {
    return null;
  }
}
