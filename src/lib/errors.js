// §6.10 Error body and catalogue
import config from '../config.js';

export const catalogue = {
  40001: { status: 400, description: 'Invalid request body' },
  40002: { status: 400, description: 'Invalid query parameter' },
  40003: { status: 400, description: 'Invalid time' },
  40004: { status: 400, description: 'Reading value out of range' },
  40005: { status: 400, description: 'Energy counter inconsistent' },
  40101: { status: 401, description: 'Authentication required' },
  40102: { status: 401, description: 'Invalid token' },
  40103: { status: 401, description: 'Invalid credentials' },
  40301: { status: 403, description: 'Insufficient scope' },
  40302: { status: 403, description: 'Outside jurisdiction' },
  40303: { status: 403, description: 'Precondition required' },
  40304: { status: 403, description: 'Installation decommissioned' },
  40305: { status: 403, description: 'Own account' },
  40306: { status: 403, description: 'Wrong installation' },
  40307: { status: 403, description: 'Wrong current password' },
  40308: { status: 403, description: 'Not allowed for this account' },
  40309: { status: 403, description: 'Forbidden origin' },
  40401: { status: 404, description: 'Resource not found' },
  40402: { status: 404, description: 'No readings yet' },
  40403: { status: 404, description: 'Path not found' },
  40501: { status: 405, description: 'Method not allowed' },
  40601: { status: 406, description: 'Not acceptable' },
  40901: { status: 409, description: 'Conflicting reading' },
  40902: { status: 409, description: 'Meter already registered' },
  40903: { status: 409, description: 'Installation has readings' },
  40904: { status: 409, description: 'Username taken' },
  41201: { status: 412, description: 'Precondition failed' },
  41501: { status: 415, description: 'Unsupported media type' },
  50001: { status: 500, description: 'Internal error' },
};

export class ApiError extends Error {
  constructor(code, message, { errors = [], headers = {} } = {}) {
    super(message);
    if (!catalogue[code]) {
      throw new Error(`Unknown error code ${code}`);
    }
    this.name = 'ApiError';
    this.code = code;
    this.status = catalogue[code].status;
    this.errors = errors;
    this.headers = headers;
  }
}

export function fieldError(code, message) {
  return { code, message };
}

export function errorBody(code, message, errors = []) {
  return {
    code,
    message,
    description: catalogue[code].description,
    more_info: `${config.publicBaseUrl}/docs`,
    error: errors,
  };
}
