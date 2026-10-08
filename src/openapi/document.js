// §10 OpenAPI 3.0.3 document
import config from '../config.js';
import { catalogue } from '../lib/errors.js';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const param = (name) => ({ $ref: `#/components/parameters/${name}` });
const header = (name) => ({ $ref: `#/components/headers/${name}` });
const json = (schema) => ({ 'application/json': { schema } });

// §7.1
const USER_SCOPES = {
  'geography:read': 'Read provinces, districts and substations',
  'generation:read': 'Read installations, readings, overviews and generation summaries in your jurisdiction',
  'installations:write': 'Register, replace, decommission and delete installations in your jurisdiction',
  'credentials:issue': 'Issue device credentials for installations in your jurisdiction',
  'account:write': 'Change your own password',
  'users:manage': 'Manage user accounts and reset passwords',
};
const DEVICE_SCOPES = {
  'readings:write': 'Send readings for the device’s own installation',
};

// ---------- info.description ----------

const errorTable = Object.entries(catalogue)
  .map(([code, { status, description }]) => `| ${status} | \`${code}\` | ${description} |`)
  .join('\n');

const description = `
JSON REST API of the Sri Lanka Sustainable Energy Authority (SLSEA) for rooftop solar generation data.
Smart meters (devices) write readings for their own installation; SLSEA users read data inside their jurisdiction.

## Getting a token in Swagger UI

Click **Authorize** and use one of the two OAuth2 flows (scopes do not need to be ticked; the token carries the scopes of the account):

- **password** — a user account: enter the \`username\` and \`password\` of a test account (for example \`colombo.analyst\`). Leave \`client_id\` and \`client_secret\` empty.
- **clientCredentials** — a device: enter the \`installation_id\` as \`client_id\` and the device secret as \`client_secret\`. Device secrets are issued by \`POST /installations/{installation-id}/device-credential\`.

Tokens are valid for 3600 seconds. A password change revokes older user tokens; a new device credential or decommissioning revokes older device tokens.

## Conventions

- Every request with a body uses \`Content-Type: application/json\`, except \`POST /token\` (\`application/x-www-form-urlencoded\`).
- An \`Accept\` header must allow \`application/json\` (else 406 \`40601\`).
- Paths are case-sensitive and have no trailing slash. Unknown paths → 404 \`40403\`.
- A method not offered on a path → 405 \`40501\` with an \`Allow\` header listing the methods of that path.
- Unknown or repeated query parameters → 400 \`40002\`.
- Collections return \`{ count, next, previous, items }\` with \`offset\` (default 0) and \`limit\` (1–100, default 20).
- Every successful GET sends \`ETag\` and \`Last-Modified\` and answers \`If-None-Match\` / \`If-Modified-Since\` with 304.
- \`PUT\` and \`DELETE\` require \`If-Match\` (missing → 403 \`40303\`, stale → 412 \`41201\`).
- Every response carries \`X-Content-Type-Options: nosniff\`; over HTTPS also \`Strict-Transport-Security: max-age=31536000\`.
- When the deployment sets an origin secret, requests not passing through the front proxy are refused with 403 \`40309\`.

## Rate limits

| Limiter | Applies to | Key | Window | Limit |
|---|---|---|---|---|
| Token | \`POST /token\` | username (password grant) or installation id (client credentials) | 15 minutes | 10 failed requests; a successful token response resets the count |
| Readings | \`POST /installations/{installation-id}/readings\` | installation of the device token | 1 minute | 120 requests |

A request over the limit gets 429 \`42901\` with \`Retry-After\` (seconds).

## Error codes

Every error body has exactly \`code\`, \`message\`, \`description\` and \`error\` (an array with one entry per field problem; empty when there is none).

| HTTP | Code | Description |
|---|---|---|
${errorTable}
`.trim();

// ---------- components ----------

const nullableRef = (name) => ({ allOf: [ref(name)], nullable: true });

const PROVINCE_ID = { type: 'integer', minimum: 1, example: 1 };
const DISTRICT_ID = { type: 'integer', minimum: 1, example: 1 };
const SUBSTATION_ID = { type: 'integer', minimum: 1, example: 1 };
const INSTALLATION_ID = { type: 'string', pattern: '^INS-[0-9]{6}$', example: 'INS-000004' };
const USER_ID = {
  type: 'string',
  format: 'uuid',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
};
const ROLE = { type: 'string', enum: ['ANALYST', 'INSTALLATION_OFFICER', 'ADMIN'] };
const LEVEL = { type: 'string', enum: ['NATIONAL', 'PROVINCIAL', 'DISTRICT'] };
const STATUS = { type: 'string', enum: ['ACTIVE', 'DECOMMISSIONED'] };
const REPORTING_STATUS = { type: 'string', enum: ['REPORTING', 'SILENT', 'NEVER_REPORTED'] };
const TIMESTAMP = { type: 'string', format: 'date-time', example: '2026-10-04T08:15:00.000Z' };
const PASSWORD = { type: 'string', minLength: 10, maxLength: 72, description: 'At most 72 bytes in UTF-8.' };

// §9 EP6, EP7 body rules
const installationFields = {
  meter_id: { type: 'string', pattern: '^[A-Z0-9-]{3,32}$', example: 'SLM-20000001' },
  capacity_kw: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 1000, example: 5 },
  status: STATUS,
  substation_id: SUBSTATION_ID,
};

// §9 EP13, EP14 body rules
const userFields = {
  name: { type: 'string', minLength: 1, maxLength: 100, example: 'Nimali Perera', description: 'Stored trimmed.' },
  username: { type: 'string', pattern: '^[a-z0-9._-]{3,32}$', example: 'nimali.p' },
  password: PASSWORD,
  role: ROLE,
  jurisdiction_level: LEVEL,
  district_id: { ...DISTRICT_ID, description: 'Posting district; must exist.' },
};

function object(properties, required = Object.keys(properties), extra = {}) {
  return { type: 'object', required, properties, ...extra };
}

function body(properties, required) {
  return object(properties, required, { additionalProperties: false });
}

function collectionOf(name) {
  return {
    allOf: [ref('Collection'), { type: 'object', properties: { items: { type: 'array', items: ref(name) } } }],
  };
}

const schemas = {
  // §6.3
  Province: object({ province_id: PROVINCE_ID, name: { type: 'string', example: 'Western' } }),
  District: object({
    district_id: DISTRICT_ID,
    name: { type: 'string', example: 'Colombo' },
    province_id: PROVINCE_ID,
  }),
  Substation: object({
    substation_id: SUBSTATION_ID,
    name: { type: 'string', example: 'Kolonnawa' },
    district_id: DISTRICT_ID,
  }),
  Installation: object({ installation_id: INSTALLATION_ID, ...installationFields }),
  Reading: object({
    reading_id: { type: 'integer', minimum: 1, example: 159313 },
    installation_id: INSTALLATION_ID,
    recorded_at: TIMESTAMP,
    power_kw: { type: 'number', example: 3.412 },
    energy_kwh: { type: 'number', example: 10234.551, description: 'Lifetime energy counter.' },
    voltage: { type: 'number', example: 236.4 },
  }),
  User: object({
    user_id: USER_ID,
    name: userFields.name,
    username: userFields.username,
    role: ROLE,
    jurisdiction_level: LEVEL,
    district_id: DISTRICT_ID,
  }),

  // §6.4
  Collection: object({
    count: { type: 'integer', minimum: 0, description: 'Total items matching the query (all pages).' },
    next: { type: 'string', format: 'uri', nullable: true },
    previous: { type: 'string', format: 'uri', nullable: true },
    items: { type: 'array', items: {} },
  }),
  ProvinceCollection: collectionOf('Province'),
  DistrictCollection: collectionOf('District'),
  SubstationCollection: collectionOf('Substation'),
  InstallationCollection: collectionOf('Installation'),
  ReadingCollection: collectionOf('Reading'),
  UserCollection: collectionOf('User'),

  // §9 EP5
  GenerationSummary: object({
    area: object({
      level: LEVEL,
      id: { type: 'integer', nullable: true, description: 'null for the national summary.', example: 1 },
      name: { type: 'string', example: 'Colombo' },
    }),
    day: { type: 'string', format: 'date', example: '2026-10-04', description: 'Sri Lanka day (+05:30).' },
    computed_at: TIMESTAMP,
    current_power_kw: { type: 'number', example: 412.338 },
    energy_today_kwh: { type: 'number', example: 1820.104 },
    installations: object({
      active: { type: 'integer', example: 26 },
      reporting: { type: 'integer', example: 24 },
      silent: { type: 'integer', example: 1 },
      never_reported: { type: 'integer', example: 1 },
      decommissioned: { type: 'integer', example: 1 },
    }),
  }),

  // §9 EP8
  Overview: object({
    installation: ref('Installation'),
    substation: object({ substation_id: SUBSTATION_ID, name: { type: 'string', example: 'Kolonnawa' } }),
    district: object({ district_id: DISTRICT_ID, name: { type: 'string', example: 'Colombo' } }),
    province: object({ province_id: PROVINCE_ID, name: { type: 'string', example: 'Western' } }),
    reporting_status: { ...REPORTING_STATUS, nullable: true, description: 'null when DECOMMISSIONED.' },
    last_known_reading: { ...nullableRef('Reading'), description: 'null when the installation has no readings.' },
  }),

  // §7.2
  TokenRequest: object(
    {
      grant_type: { type: 'string', enum: ['password', 'client_credentials'] },
      username: { type: 'string', description: 'Required for grant_type=password.' },
      password: { type: 'string', format: 'password', description: 'Required for grant_type=password.' },
    },
    ['grant_type'],
  ),
  TokenResponse: object({
    access_token: { type: 'string' },
    token_type: { type: 'string', enum: ['Bearer'] },
    expires_in: { type: 'integer', example: 3600 },
    scope: { type: 'string', example: 'geography:read generation:read account:write' },
  }),

  // §9 EP6, EP7
  InstallationCreate: body(
    {
      meter_id: installationFields.meter_id,
      capacity_kw: installationFields.capacity_kw,
      substation_id: installationFields.substation_id,
    },
    ['meter_id', 'capacity_kw', 'substation_id'],
  ),
  InstallationReplace: body(installationFields),

  // §9 EP10
  ReadingCreate: body({
    recorded_at: {
      ...TIMESTAMP,
      description: 'Measurement time with a time zone offset; at most 2 minutes in the future and 7 days in the past.',
    },
    power_kw: { type: 'number', minimum: 0, example: 3.412, description: 'At most capacity_kw × 1.05.' },
    energy_kwh: {
      type: 'number',
      minimum: 0,
      example: 10234.551,
      description: 'Lifetime counter; not below the previous or above the next reading in time.',
    },
    voltage: { type: 'number', minimum: 180, maximum: 270, example: 236.4 },
  }),

  // §9 EP12
  DeviceCredential: object({
    installation_id: INSTALLATION_ID,
    device_secret: { type: 'string', description: 'Shown once; use it as client_secret.' },
    issued_at: TIMESTAMP,
  }),

  // §9 EP13, EP14
  UserCreate: body(userFields),
  UserReplace: body({
    name: userFields.name,
    username: userFields.username,
    role: ROLE,
    jurisdiction_level: LEVEL,
    district_id: userFields.district_id,
  }),

  // §9 EP15
  OwnPasswordChange: body({
    current_password: { type: 'string', format: 'password' },
    new_password: { ...PASSWORD, format: 'password', description: 'At most 72 bytes in UTF-8. Different from the current password.' },
  }),
  PasswordReset: body({ new_password: { ...PASSWORD, format: 'password' } }),
  PasswordChanged: object({ user_id: USER_ID, password_changed_at: TIMESTAMP }),

  // §6.10
  Error: object({
    code: { type: 'integer', example: 40001 },
    message: { type: 'string', example: 'capacity_kw must be greater than 0 and at most 1000.' },
    description: { type: 'string', example: 'Invalid request body' },
    error: {
      type: 'array',
      description: 'One entry per field problem; empty when there is none.',
      items: object({ code: { type: 'integer' }, message: { type: 'string' } }),
    },
  }, undefined, { additionalProperties: false }),
};

const stringHeader = (text) => ({ description: text, schema: { type: 'string' } });

// §6.11
const headers = {
  ETag: stringHeader('Strong validator of the representation.'),
  'Last-Modified': stringHeader('HTTP date, whole seconds.'),
  Location: { description: 'Absolute URL of the new resource.', schema: { type: 'string', format: 'uri' } },
  'Content-Location': { description: 'Absolute URL of the returned reading.', schema: { type: 'string', format: 'uri' } },
  'Cache-Control': stringHeader('no-store'),
  Pragma: stringHeader('no-cache'),
  'WWW-Authenticate': stringHeader('Bearer realm="solar" (with error="invalid_token" for 40102), or Basic realm="solar" at /token.'),
  'Retry-After': { description: 'Seconds until the limit resets.', schema: { type: 'integer', minimum: 1 } },
  Allow: stringHeader('Methods offered on the path, e.g. GET, POST.'),
};

const pathParam = (name, schema, text) => ({ name, in: 'path', required: true, description: text, schema });
const queryParam = (name, schema, text) => ({ name, in: 'query', required: false, description: text, schema });
const filterText = 'Must be an existing id.';
const FILTER_ID = { type: 'integer', minimum: 1 };
const timeText = 'ISO 8601 timestamp with a time zone offset, e.g. 2026-10-04T00:00:00+05:30.';

// §6.1 path ids, §6.4, §6.5, §6.7, §6.8
const parameters = {
  ProvinceId: pathParam('province-id', { type: 'string', pattern: '^[1-9][0-9]*$', example: '1' }),
  DistrictId: pathParam('district-id', { type: 'string', pattern: '^[1-9][0-9]*$', example: '1' }),
  SubstationId: pathParam('substation-id', { type: 'string', pattern: '^[1-9][0-9]*$', example: '1' }),
  InstallationId: pathParam('installation-id', INSTALLATION_ID),
  ReadingId: pathParam('reading-id', { type: 'string', pattern: '^[1-9][0-9]*$', example: '2017' }),
  UserId: pathParam('user-id', USER_ID),
  Offset: queryParam('offset', { type: 'integer', minimum: 0, default: 0 }, 'Items to skip.'),
  Limit: queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }, 'Page size.'),
  ProvinceFilter: queryParam('province-id', FILTER_ID, filterText),
  DistrictFilter: queryParam('district-id', FILTER_ID, filterText),
  SubstationFilter: queryParam('substation-id', FILTER_ID, filterText),
  Status: queryParam('status', STATUS),
  ReportingStatus: queryParam('reporting-status', REPORTING_STATUS, 'Keeps only ACTIVE installations with this status.'),
  Role: queryParam('role', ROLE),
  JurisdictionLevel: queryParam('jurisdiction-level', LEVEL),
  Sort: queryParam('sort', { type: 'string', enum: ['recorded-at:desc', 'recorded-at:asc'], default: 'recorded-at:desc' }),
  From: queryParam('from', { type: 'string', format: 'date-time' }, `Inclusive. ${timeText}`),
  To: queryParam('to', { type: 'string', format: 'date-time' }, `Exclusive; must be later than from. ${timeText}`),
  IfNoneMatch: {
    name: 'If-None-Match',
    in: 'header',
    required: false,
    description: 'ETag(s) from an earlier response; a match → 304.',
    schema: { type: 'string' },
  },
  IfModifiedSince: {
    name: 'If-Modified-Since',
    in: 'header',
    required: false,
    description: 'HTTP date; not modified since → 304.',
    schema: { type: 'string' },
  },
  IfMatch: {
    name: 'If-Match',
    in: 'header',
    required: true,
    description: 'ETag of the current representation (from GET), or *. Missing → 403 40303; stale → 412 41201.',
    schema: { type: 'string' },
  },
};

const securitySchemes = {
  // §7.1, §7.2
  oauth2: {
    type: 'oauth2',
    description:
      'Bearer tokens from POST /token. Users: password flow. Devices: client credentials (installation_id as client_id, device secret as client_secret).',
    flows: {
      password: { tokenUrl: `${config.publicBaseUrl}/token`, scopes: USER_SCOPES },
      clientCredentials: { tokenUrl: `${config.publicBaseUrl}/token`, scopes: DEVICE_SCOPES },
    },
  },
};

// ---------- responses ----------

const CACHING = { ETag: header('ETag'), 'Last-Modified': header('Last-Modified') };
const NO_STORE = { 'Cache-Control': header('Cache-Control'), Pragma: header('Pragma') };

const ok = (schema, text = 'OK', extraHeaders = {}) => ({
  description: text,
  headers: { ...CACHING, ...extraHeaders },
  content: json(schema),
});
const notModified = { description: 'Not modified (no body).', headers: CACHING };
const created = (schema) => ({
  description: 'Created.',
  headers: { Location: header('Location'), 'Content-Location': header('Content-Location'), ...CACHING },
  content: json(schema),
});
const getResponses = (schema) => ({ 200: ok(schema), 304: notModified });

const ERROR_HEADERS = {
  401: { 'WWW-Authenticate': header('WWW-Authenticate') },
  429: { 'Retry-After': header('Retry-After') },
};

// §6.10: one response per status, listing the codes this operation can return
function errorResponse(status, codes, extraHeaders = {}) {
  const response = { description: codes.map((code) => `\`${code}\` ${catalogue[code].description}`).join(' · ') };
  const all = { ...ERROR_HEADERS[status], ...extraHeaders };
  if (Object.keys(all).length) response.headers = all;
  response.content = json(ref('Error'));
  return response;
}

function mergeCodes(...lists) {
  const merged = {};
  for (const list of lists) {
    for (const [status, codes] of Object.entries(list)) {
      merged[status] = [...new Set([...(merged[status] ?? []), ...codes])].sort();
    }
  }
  return merged;
}

// §9 "401/403 40301/406 possible everywhere"; §6.5; §7.10
const BEARER_ERRORS = { 400: [40002], 401: [40101, 40102], 403: [40301, 40309], 406: [40601], 500: [50001] };

function operation({ tag, summary, description: text, scopes, parameters: params = [], requestBody, responses, errors }) {
  const op = { tags: [tag], summary };
  if (text) op.description = text;
  op.security = scopes.map((scope) => ({ oauth2: [scope] }));
  if (params.length) op.parameters = params;
  if (requestBody) op.requestBody = requestBody;
  op.responses = { ...responses };
  for (const [status, codes] of Object.entries(mergeCodes(BEARER_ERRORS, errors))) {
    op.responses[status] = errorResponse(Number(status), codes);
  }
  return op;
}

const GET_HEADERS = [param('IfNoneMatch'), param('IfModifiedSince')];
const jsonBody = (name) => ({ required: true, content: json(ref(name)) });

// §6.1: the Allow list of a path is the set of its operations; other methods → 405
function route(operations) {
  const allow = Object.keys(operations)
    .map((method) => method.toUpperCase())
    .join(', ');
  const note = `Other methods on this path → 405 \`40501\` with \`Allow: ${allow}\`.`;
  const item = {};
  for (const [method, op] of Object.entries(operations)) {
    item[method] = { ...op, description: op.description ? `${op.description}\n\n${note}` : note };
  }
  return item;
}

// ---------- paths (§9) ----------

const geographyList = (name, tagSummary, filters) =>
  route({
    get: operation({
      tag: 'Geography',
      summary: tagSummary,
      scopes: ['geography:read'],
      parameters: [...filters.map(param), param('Offset'), param('Limit'), ...GET_HEADERS],
      responses: getResponses(ref(`${name}Collection`)),
      errors: {},
    }),
  });

const geographyMember = (name, idParam, tagSummary) =>
  route({
    get: operation({
      tag: 'Geography',
      summary: tagSummary,
      scopes: ['geography:read'],
      parameters: [param(idParam), ...GET_HEADERS],
      responses: getResponses(ref(name)),
      errors: { 404: [40401] },
    }),
  });

const summary = (idParam, tagSummary, text, errors) =>
  route({
    get: operation({
      tag: 'Generation summaries',
      summary: tagSummary,
      description: `${text} No query parameters. ETag ignores \`computed_at\`.`,
      scopes: ['generation:read'],
      parameters: [...(idParam ? [param(idParam)] : []), ...GET_HEADERS],
      responses: getResponses(ref('GenerationSummary')),
      errors: { 403: [40302], ...errors },
    }),
  });

const regionReadings = (idParam, tagSummary, filters) =>
  route({
    get: operation({
      tag: 'Readings',
      summary: tagSummary,
      description:
        'Readings of every installation in the region (any status), sorted by `recorded_at` then `installation_id`. ' +
        'A filter outside the path region (or a substation outside the given `district-id`) → 400 `40002`.',
      scopes: ['generation:read'],
      parameters: [
        param(idParam),
        ...filters.map(param),
        param('From'),
        param('To'),
        param('Sort'),
        param('Offset'),
        param('Limit'),
        ...GET_HEADERS,
      ],
      responses: getResponses(ref('ReadingCollection')),
      errors: { 400: [40003], 403: [40302], 404: [40401] },
    }),
  });

const NO_STORE_ERRORS = (status, codes) => errorResponse(status, codes, NO_STORE);

const paths = {
  // EP1 (§7.2)
  '/token': route({
    post: {
      tags: ['Token'],
      summary: 'Get an access token',
      description:
        '`grant_type=password` with `username` and `password` (users), or `grant_type=client_credentials` with ' +
        '`Authorization: Basic base64(installation_id:device_secret)` (devices). Unknown form fields are ignored. ' +
        'Every response carries `Cache-Control: no-store` and `Pragma: no-cache`. ' +
        'Rate limit: 10 failed requests per 15 minutes per username / installation.',
      security: [],
      requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: ref('TokenRequest') } } },
      responses: {
        200: { description: 'Token issued.', headers: NO_STORE, content: json(ref('TokenResponse')) },
        400: NO_STORE_ERRORS(400, [40001]),
        401: errorResponse(401, [40103], NO_STORE),
        403: NO_STORE_ERRORS(403, [40309]),
        406: NO_STORE_ERRORS(406, [40601]),
        415: NO_STORE_ERRORS(415, [41501]),
        429: errorResponse(429, [42901], NO_STORE),
        500: NO_STORE_ERRORS(500, [50001]),
      },
    },
  }),

  // EP2–EP4
  '/provinces': geographyList('Province', 'List provinces', []),
  '/provinces/{province-id}': geographyMember('Province', 'ProvinceId', 'Get a province'),
  '/districts': geographyList('District', 'List districts', ['ProvinceFilter']),
  '/districts/{district-id}': geographyMember('District', 'DistrictId', 'Get a district'),
  '/substations': geographyList('Substation', 'List substations', ['ProvinceFilter', 'DistrictFilter']),
  '/substations/{substation-id}': geographyMember('Substation', 'SubstationId', 'Get a substation'),

  // EP5
  '/districts/{district-id}/generation-summary': summary(
    'DistrictId',
    'Generation summary of a district',
    'The district must be inside your jurisdiction.',
    { 404: [40401] },
  ),
  '/provinces/{province-id}/generation-summary': summary(
    'ProvinceId',
    'Generation summary of a province',
    'The whole province must be inside your jurisdiction.',
    { 404: [40401] },
  ),
  '/generation-summary': summary(null, 'National generation summary', 'Only for NATIONAL users.', {}),

  // EP6
  '/installations': route({
    get: operation({
      tag: 'Installations',
      summary: 'List installations in your jurisdiction',
      description: 'Sorted by `installation_id`. A region filter outside your jurisdiction → 403 `40302`.',
      scopes: ['generation:read'],
      parameters: [
        param('ProvinceFilter'),
        param('DistrictFilter'),
        param('SubstationFilter'),
        param('Status'),
        param('ReportingStatus'),
        param('Offset'),
        param('Limit'),
        ...GET_HEADERS,
      ],
      responses: getResponses(ref('InstallationCollection')),
      errors: { 403: [40302] },
    }),
    post: operation({
      tag: 'Installations',
      summary: 'Register an installation',
      description: 'Created with `status: ACTIVE` and no device credential. `status` in the body → 400 `40001`.',
      scopes: ['installations:write'],
      requestBody: jsonBody('InstallationCreate'),
      responses: { 201: created(ref('Installation')) },
      errors: { 400: [40001], 403: [40302], 409: [40902], 415: [41501] },
    }),
  }),

  // EP7
  '/installations/{installation-id}': route({
    get: operation({
      tag: 'Installations',
      summary: 'Get an installation',
      scopes: ['generation:read'],
      parameters: [param('InstallationId'), ...GET_HEADERS],
      responses: getResponses(ref('Installation')),
      errors: { 404: [40401] },
    }),
    put: operation({
      tag: 'Installations',
      summary: 'Replace an installation',
      description:
        'All four fields required. Changing `status` to `DECOMMISSIONED` removes the device credential. ' +
        'Order: body (400) → not found / outside jurisdiction (404) → new substation outside jurisdiction (403 `40302`) → ' +
        '`If-Match` (403 `40303` / 412) → `meter_id` of another installation (409).',
      scopes: ['installations:write'],
      parameters: [param('InstallationId'), param('IfMatch')],
      requestBody: jsonBody('InstallationReplace'),
      responses: { 200: ok(ref('Installation'), 'Replaced; body is the new representation.') },
      errors: { 400: [40001], 403: [40302, 40303], 404: [40401], 409: [40902], 412: [41201], 415: [41501] },
    }),
    delete: operation({
      tag: 'Installations',
      summary: 'Delete an installation without readings',
      description: 'An installation with readings → 409 `40903` (decommission it with PUT instead).',
      scopes: ['installations:write'],
      parameters: [param('InstallationId'), param('IfMatch')],
      responses: { 200: { description: 'Deleted; body is the deleted representation.', content: json(ref('Installation')) } },
      errors: { 403: [40303], 404: [40401], 409: [40903], 412: [41201] },
    }),
  }),

  // EP8
  '/installations/{installation-id}/overview': route({
    get: operation({
      tag: 'Installations',
      summary: 'Installation overview',
      description: 'Installation, its geography, reporting status and last known reading.',
      scopes: ['generation:read'],
      parameters: [param('InstallationId'), ...GET_HEADERS],
      responses: getResponses(ref('Overview')),
      errors: { 404: [40401] },
    }),
  }),

  // EP9
  '/installations/{installation-id}/last-known-reading': route({
    get: operation({
      tag: 'Readings',
      summary: 'Newest reading of an installation',
      description: '`Content-Location` is the URL of the reading. No readings → 404 `40402`.',
      scopes: ['generation:read'],
      parameters: [param('InstallationId'), ...GET_HEADERS],
      responses: {
        200: ok(ref('Reading'), 'OK', { 'Content-Location': header('Content-Location') }),
        304: notModified,
      },
      errors: { 404: [40401, 40402] },
    }),
  }),

  // EP10
  '/installations/{installation-id}/readings': route({
    get: operation({
      tag: 'Readings',
      summary: 'Reading history of an installation',
      scopes: ['generation:read'],
      parameters: [
        param('InstallationId'),
        param('From'),
        param('To'),
        param('Sort'),
        param('Offset'),
        param('Limit'),
        ...GET_HEADERS,
      ],
      responses: getResponses(ref('ReadingCollection')),
      errors: { 400: [40003], 404: [40401] },
    }),
    post: operation({
      tag: 'Readings',
      summary: 'Send a reading (device token)',
      description:
        'Only for the installation of the device token (another installation → 403 `40306`). No query parameters. ' +
        'Resending an identical reading → 200 with the stored reading; same `recorded_at` with different values → 409 `40901`. ' +
        'Rate limit: 120 requests per minute per installation.',
      scopes: ['readings:write'],
      parameters: [param('InstallationId')],
      requestBody: jsonBody('ReadingCreate'),
      responses: {
        200: ok(ref('Reading'), 'Identical reading already stored; body is that reading.', {
          'Content-Location': header('Content-Location'),
        }),
        201: created(ref('Reading')),
      },
      errors: {
        400: [40001, 40003, 40004, 40005],
        403: [40304, 40306],
        404: [40401],
        409: [40901],
        415: [41501],
        429: [42901],
      },
    }),
  }),

  // EP11
  '/installations/{installation-id}/readings/{reading-id}': route({
    get: operation({
      tag: 'Readings',
      summary: 'Get a reading',
      scopes: ['generation:read'],
      parameters: [param('InstallationId'), param('ReadingId'), ...GET_HEADERS],
      responses: getResponses(ref('Reading')),
      errors: { 404: [40401] },
    }),
  }),

  // EP12
  '/installations/{installation-id}/device-credential': route({
    post: operation({
      tag: 'Installations',
      summary: 'Issue a device credential',
      description:
        'No request body (a non-empty body → 400 `40001`). Replaces any earlier secret and revokes its tokens. ' +
        'The secret is returned once.',
      scopes: ['credentials:issue'],
      parameters: [param('InstallationId')],
      responses: { 200: { description: 'Credential issued.', headers: NO_STORE, content: json(ref('DeviceCredential')) } },
      errors: { 400: [40001], 403: [40304], 404: [40401] },
    }),
  }),

  // EP13
  '/users': route({
    get: operation({
      tag: 'Users',
      summary: 'List users',
      description: 'Sorted by `username`.',
      scopes: ['users:manage'],
      parameters: [
        param('DistrictFilter'),
        param('Role'),
        param('JurisdictionLevel'),
        param('Offset'),
        param('Limit'),
        ...GET_HEADERS,
      ],
      responses: getResponses(ref('UserCollection')),
      errors: {},
    }),
    post: operation({
      tag: 'Users',
      summary: 'Create a user',
      description: '`role: ADMIN` requires `jurisdiction_level: NATIONAL`.',
      scopes: ['users:manage'],
      requestBody: jsonBody('UserCreate'),
      responses: { 201: created(ref('User')) },
      errors: { 400: [40001], 409: [40904], 415: [41501] },
    }),
  }),

  // EP14
  '/users/{user-id}': route({
    get: operation({
      tag: 'Users',
      summary: 'Get a user',
      scopes: ['users:manage'],
      parameters: [param('UserId'), ...GET_HEADERS],
      responses: getResponses(ref('User')),
      errors: { 404: [40401] },
    }),
    put: operation({
      tag: 'Users',
      summary: 'Replace a user',
      description:
        'All fields required; `password` is not allowed (use the password endpoint). ' +
        'Order: body (400) → not found (404) → `If-Match` (403 `40303` / 412) → own account (403 `40305`) → username taken (409).',
      scopes: ['users:manage'],
      parameters: [param('UserId'), param('IfMatch')],
      requestBody: jsonBody('UserReplace'),
      responses: { 200: ok(ref('User'), 'Replaced; body is the new representation.') },
      errors: { 400: [40001], 403: [40303, 40305], 404: [40401], 409: [40904], 412: [41201], 415: [41501] },
    }),
    delete: operation({
      tag: 'Users',
      summary: 'Delete a user',
      description: 'Your own account → 403 `40305`.',
      scopes: ['users:manage'],
      parameters: [param('UserId'), param('IfMatch')],
      responses: { 200: { description: 'Deleted; body is the deleted representation.', content: json(ref('User')) } },
      errors: { 403: [40303, 40305], 404: [40401], 412: [41201] },
    }),
  }),

  // EP15
  '/users/{user-id}/password': route({
    post: operation({
      tag: 'Users',
      summary: 'Change or reset a password',
      description:
        'Own account: `current_password` and `new_password` (wrong current password → 403 `40307`). ' +
        'Another account: `new_password` only, and only with `users:manage` (else 403 `40308`). ' +
        'Revokes the user’s older tokens.',
      scopes: ['account:write', 'users:manage'],
      parameters: [param('UserId')],
      requestBody: {
        required: true,
        content: json({ oneOf: [ref('OwnPasswordChange'), ref('PasswordReset')] }),
      },
      responses: { 200: { description: 'Password changed.', headers: NO_STORE, content: json(ref('PasswordChanged')) } },
      errors: { 400: [40001], 403: [40307, 40308], 404: [40401], 415: [41501] },
    }),
  }),

  // EP17
  '/districts/{district-id}/readings': regionReadings('DistrictId', 'Readings of a district', ['SubstationFilter']),
  '/provinces/{province-id}/readings': regionReadings('ProvinceId', 'Readings of a province', [
    'DistrictFilter',
    'SubstationFilter',
  ]),
};

const document = {
  openapi: '3.0.3',
  info: { title: 'SLSEA Solar Generation API', version: '1.0', description },
  servers: [{ url: config.publicBaseUrl }],
  tags: [
    { name: 'Token', description: 'Access tokens (OAuth2 password and client credentials).' },
    { name: 'Geography', description: 'Provinces, districts and substations.' },
    { name: 'Generation summaries', description: 'Current power and energy today per region.' },
    { name: 'Installations', description: 'Rooftop solar installations and device credentials.' },
    { name: 'Readings', description: 'Generation readings sent by smart meters.' },
    { name: 'Users', description: 'SLSEA user accounts and passwords.' },
  ],
  paths,
  components: {
    schemas,
    parameters,
    headers,
    // §6.1: answered on every path for a method it does not offer
    responses: { MethodNotAllowed: errorResponse(405, [40501], { Allow: header('Allow') }) },
    securitySchemes,
  },
};

export default document;
