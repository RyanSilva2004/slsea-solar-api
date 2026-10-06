// §12 Tests

export const baseUrl = process.env.TEST_BASE_URL || process.env.PUBLIC_BASE_URL;
export const rootUrl = new URL('/', baseUrl).href;
export const originSecret = process.env.ORIGIN_SECRET || '';

// §11: path is relative to baseUrl unless it is an absolute URL
export async function api(method, path, { token, headers = {}, body, form } = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${baseUrl}${path}`;
  const allHeaders = {};
  if (originSecret) {
    allHeaders['X-Origin-Secret'] = originSecret;
  }
  if (token) {
    allHeaders.Authorization = `Bearer ${token}`;
  }
  let payload;
  if (form !== undefined) {
    allHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    allHeaders['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  Object.assign(allHeaders, headers);

  const res = await fetch(url, { method, headers: allHeaders, body: payload });
  const text = await res.text();
  let json = null;
  if (text && (res.headers.get('content-type') || '').includes('application/json')) {
    json = JSON.parse(text);
  }
  return { status: res.status, headers: res.headers, body: json, text };
}

const userTokens = new Map();

export async function userToken(username, password = process.env.TEST_ACCOUNT_PASSWORD) {
  const key = `${username}:${password}`;
  if (!userTokens.has(key)) {
    const res = await api('POST', '/token', { form: { grant_type: 'password', username, password } });
    if (res.status !== 200) {
      throw new Error(`Token for ${username} failed with ${res.status}: ${res.text}`);
    }
    userTokens.set(key, res.body.access_token);
  }
  return userTokens.get(key);
}

export async function deviceToken(installationId, secret) {
  const basic = Buffer.from(`${installationId}:${secret}`).toString('base64');
  const res = await api('POST', '/token', {
    form: { grant_type: 'client_credentials' },
    headers: { Authorization: `Basic ${basic}` },
  });
  if (res.status !== 200) {
    throw new Error(`Device token for ${installationId} failed with ${res.status}: ${res.text}`);
  }
  return res.body.access_token;
}
