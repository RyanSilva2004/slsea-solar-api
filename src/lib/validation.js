// §9 Body validators: each reader lists every field problem and throws one 400 40001
import { ApiError, fieldError } from './errors.js';
import { districtsById, substationsById } from './geography.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const METER_PATTERN = /^[A-Z0-9-]{3,32}$/;
const STATUSES = ['ACTIVE', 'DECOMMISSIONED'];
const ROLES = ['ANALYST', 'INSTALLATION_OFFICER', 'ADMIN'];
const LEVELS = ['NATIONAL', 'PROVINCIAL', 'DISTRICT'];

function problem(message) {
  return fieldError(40001, message);
}

function throwIfInvalid(errors) {
  if (errors.length > 0) {
    throw new ApiError(40001, errors.map((error) => error.message).join(' '), { errors });
  }
}

// Fields not in `allowed` → one problem each; `messages` gives some fields their own text
function unknownFields(body, allowed, messages = {}) {
  return Object.keys(body)
    .filter((name) => !allowed.includes(name))
    .map((name) => problem(messages[name] ?? `Unknown field "${name}".`));
}

// rules: { field: value → error message or null }; missing fields are reported as required
function checkRules(body, rules) {
  const errors = [];
  for (const [name, rule] of Object.entries(rules)) {
    const message = Object.hasOwn(body, name) ? rule(body[name]) : `${name} is required.`;
    if (message) {
      errors.push(problem(message));
    }
  }
  return errors;
}

// §7.8: bcrypt ignores everything after the first 72 bytes
function isPassword(value) {
  return (
    typeof value === 'string' &&
    value.length >= 10 &&
    value.length <= 72 &&
    Buffer.byteLength(value, 'utf8') <= 72
  );
}

// §7.8
function passwordRule(name) {
  return (value) =>
    isPassword(value) ? null : `${name} must be a string of 10 to 72 characters and at most 72 bytes in UTF-8.`;
}

// §9 EP13
const userRules = {
  name: (value) => {
    const length = typeof value === 'string' ? value.trim().length : 0;
    return length >= 1 && length <= 100 ? null : 'name must be a string of 1 to 100 characters.';
  },
  username: (value) =>
    typeof value === 'string' && USERNAME_PATTERN.test(value)
      ? null
      : 'username must be 3 to 32 characters of a-z, 0-9, ".", "_" or "-".',
  role: (value) => (ROLES.includes(value) ? null : `role must be one of: ${ROLES.join(', ')}.`),
  jurisdiction_level: (value) =>
    LEVELS.includes(value) ? null : `jurisdiction_level must be one of: ${LEVELS.join(', ')}.`,
  district_id: (value) =>
    Number.isInteger(value) && districtsById.has(value) ? null : 'district_id must be the id of an existing district.',
};

// EP13 POST (withPassword) and EP14 PUT → { name, username, role, jurisdiction_level, district_id, password? }
export function readUserBody(body, { withPassword }) {
  const rules = withPassword ? { ...userRules, password: passwordRule('password') } : userRules;
  const messages = withPassword ? {} : { password: 'password cannot be set here; use /users/{user-id}/password.' };
  const errors = [...unknownFields(body, Object.keys(rules), messages), ...checkRules(body, rules)];
  if (errors.length === 0 && body.role === 'ADMIN' && body.jurisdiction_level !== 'NATIONAL') {
    errors.push(problem('An ADMIN must have jurisdiction_level NATIONAL.'));
  }
  throwIfInvalid(errors);

  const values = {
    name: body.name.trim(),
    username: body.username,
    role: body.role,
    jurisdiction_level: body.jurisdiction_level,
    district_id: body.district_id,
  };
  if (withPassword) {
    values.password = body.password;
  }
  return values;
}

// §9 EP6
const installationRules = {
  meter_id: (value) =>
    typeof value === 'string' && METER_PATTERN.test(value)
      ? null
      : 'meter_id must be 3 to 32 characters of A-Z, 0-9 or "-".',
  capacity_kw: (value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000
      ? null
      : 'capacity_kw must be greater than 0 and at most 1000.',
  substation_id: (value) =>
    Number.isInteger(value) && substationsById.has(value) ? null : 'substation_id must be the id of an existing substation.',
};

const statusRule = (value) =>
  STATUSES.includes(value) ? null : `status must be one of: ${STATUSES.join(', ')}.`;

// EP6 POST and EP7 PUT (withStatus) → { meter_id, capacity_kw, substation_id, status? }
export function readInstallationBody(body, { withStatus }) {
  const rules = withStatus ? { ...installationRules, status: statusRule } : installationRules;
  const messages = withStatus ? {} : { status: 'status cannot be set on create.' };
  throwIfInvalid([...unknownFields(body, Object.keys(rules), messages), ...checkRules(body, rules)]);

  const values = { meter_id: body.meter_id, capacity_kw: body.capacity_kw, substation_id: body.substation_id };
  if (withStatus) {
    values.status = body.status;
  }
  return values;
}

// EP15 own account: exactly current_password and new_password, both strings
export function readOwnPasswordBody(body) {
  const isString = (name) => (value) => (typeof value === 'string' ? null : `${name} must be a string.`);
  const rules = { current_password: isString('current_password'), new_password: isString('new_password') };
  throwIfInvalid([...unknownFields(body, Object.keys(rules)), ...checkRules(body, rules)]);
  return { currentPassword: body.current_password, newPassword: body.new_password };
}

// EP15 own account, after current_password is verified
export function checkNewPassword(newPassword, currentPassword) {
  const errors = checkRules({ new_password: newPassword }, { new_password: passwordRule('new_password') });
  if (errors.length === 0 && newPassword === currentPassword) {
    errors.push(problem('new_password must be different from the current password.'));
  }
  throwIfInvalid(errors);
}

// EP15 another account: exactly new_password
export function readResetPasswordBody(body) {
  const rules = { new_password: passwordRule('new_password') };
  throwIfInvalid([...unknownFields(body, Object.keys(rules)), ...checkRules(body, rules)]);
  return body.new_password;
}

function finiteNumberRule(name) {
  return (value) => (typeof value === 'number' && Number.isFinite(value) ? null : `${name} must be a finite number.`);
}

// §9 EP10 POST step 1
const readingRules = {
  recorded_at: (value) => (typeof value === 'string' ? null : 'recorded_at must be a string.'),
  power_kw: finiteNumberRule('power_kw'),
  energy_kwh: finiteNumberRule('energy_kwh'),
  voltage: finiteNumberRule('voltage'),
};

// EP10 POST → { recorded_at (still a string), power_kw, energy_kwh, voltage }
export function readReadingBody(body) {
  const messages = { installation_id: 'installation_id comes from the URL.' };
  throwIfInvalid([...unknownFields(body, Object.keys(readingRules), messages), ...checkRules(body, readingRules)]);
  return {
    recorded_at: body.recorded_at,
    power_kw: body.power_kw,
    energy_kwh: body.energy_kwh,
    voltage: body.voltage,
  };
}
