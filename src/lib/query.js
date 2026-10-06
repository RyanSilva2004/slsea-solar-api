// §6.5 Query parameters
import { ApiError, fieldError } from './errors.js';
import { districtsById, provincesById, substationsById } from './geography.js';
import { parseTimestamp } from './time.js';

const ID_PATTERN = /^[1-9][0-9]*$/;
const NUMBER_PATTERN = /^[0-9]+$/;

function invalid(code, message) {
  return new ApiError(code, message, { errors: [fieldError(code, message)] });
}

function integerParam(min, max) {
  return (value, name) => {
    const number = Number(value);
    if (!NUMBER_PATTERN.test(value) || number < min || number > max) {
      throw invalid(40002, `${name} must be an integer from ${min} to ${max}.`);
    }
    return number;
  };
}

function regionParam(map) {
  return (value, name) => {
    const id = Number(value);
    if (!ID_PATTERN.test(value) || !map.has(id)) {
      throw invalid(40002, `${name} must be the id of an existing record.`);
    }
    return id;
  };
}

function enumParam(values) {
  return (value, name) => {
    if (!values.includes(value)) {
      throw invalid(40002, `${name} must be one of: ${values.join(', ')}.`);
    }
    return value;
  };
}

function timeParam(value, name) {
  const date = parseTimestamp(value);
  if (date === null) {
    throw invalid(40003, `${name} must be an ISO 8601 timestamp with a time zone offset.`);
  }
  return date;
}

export const params = {
  offset: integerParam(0, Number.MAX_SAFE_INTEGER),
  limit: integerParam(1, 100),
  'province-id': regionParam(provincesById),
  'district-id': regionParam(districtsById),
  'substation-id': regionParam(substationsById),
  status: enumParam(['ACTIVE', 'DECOMMISSIONED']),
  'reporting-status': enumParam(['REPORTING', 'SILENT', 'NEVER_REPORTED']),
  role: enumParam(['ANALYST', 'INSTALLATION_OFFICER', 'ADMIN']),
  'jurisdiction-level': enumParam(['NATIONAL', 'PROVINCIAL', 'DISTRICT']),
  sort: enumParam(['recorded-at:desc', 'recorded-at:asc']),
  from: timeParam,
  to: timeParam,
};

export function readQuery(req, allowed) {
  const search = new URL(req.originalUrl, 'http://localhost').searchParams;
  const result = {};
  for (const name of new Set(search.keys())) {
    if (!allowed.includes(name)) {
      throw invalid(40002, `Unknown query parameter "${name}".`);
    }
    const values = search.getAll(name);
    if (values.length > 1) {
      throw invalid(40002, `Query parameter "${name}" is given more than once.`);
    }
    result[name] = params[name](values[0], name);
  }
  if (result.from && result.to && result.from >= result.to) {
    throw invalid(40003, 'from must be earlier than to.');
  }
  return result;
}
