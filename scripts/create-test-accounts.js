// §11.1 Creates the test accounts through POST /users; 409 means the account exists and is skipped
const baseUrl = process.env.TEST_BASE_URL || process.env.PUBLIC_BASE_URL;
const originSecret = process.env.ORIGIN_SECRET || '';
const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'hq.admin';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const accountPassword = process.env.TEST_ACCOUNT_PASSWORD;

const accounts = [
  ['colombo.analyst', 'Colombo Analyst', 'ANALYST', 'DISTRICT', 1],
  ['kandy.analyst', 'Kandy Analyst', 'ANALYST', 'DISTRICT', 4],
  ['western.analyst', 'Western Analyst', 'ANALYST', 'PROVINCIAL', 1],
  ['central.analyst', 'Central Analyst', 'ANALYST', 'PROVINCIAL', 4],
  ['national.analyst', 'National Analyst', 'ANALYST', 'NATIONAL', 1],
  ['colombo.officer', 'Colombo Officer', 'INSTALLATION_OFFICER', 'DISTRICT', 1],
  ['kandy.officer', 'Kandy Officer', 'INSTALLATION_OFFICER', 'DISTRICT', 4],
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

// §11: X-Origin-Secret on every request when ORIGIN_SECRET is set
function headers(extra) {
  return originSecret ? { 'X-Origin-Secret': originSecret, ...extra } : extra;
}

async function adminToken() {
  const res = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: new URLSearchParams({ grant_type: 'password', username: adminUsername, password: adminPassword }),
  });
  if (res.status !== 200) {
    fail(`Token for ${adminUsername} failed with ${res.status}: ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function createAccount(token, [username, name, role, level, districtId]) {
  const res = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    headers: headers({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name,
      username,
      password: accountPassword,
      role,
      jurisdiction_level: level,
      district_id: districtId,
    }),
  });
  if (res.status === 201) {
    return 'created';
  }
  if (res.status === 409) {
    return 'exists (skipped)';
  }
  const body = await res.json().catch(() => ({}));
  return `failed: ${res.status} ${body.code ?? ''} ${body.message ?? ''}`.trim();
}

if (!baseUrl) {
  fail('TEST_BASE_URL or PUBLIC_BASE_URL is required.');
}
if (!adminPassword) {
  fail('BOOTSTRAP_ADMIN_PASSWORD is required.');
}
if (!accountPassword) {
  fail('TEST_ACCOUNT_PASSWORD is required.');
}

const token = await adminToken();
const results = [];
for (const account of accounts) {
  results.push([account[0], await createAccount(token, account)]);
}

console.log(`Test accounts at ${baseUrl}`);
console.log(`${'username'.padEnd(18)} result`);
for (const [username, result] of results) {
  console.log(`${username.padEnd(18)} ${result}`);
}
if (results.some(([, result]) => result.startsWith('failed'))) {
  process.exit(1);
}
