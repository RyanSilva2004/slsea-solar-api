// §6.7 Conditional GET, §6.8 Conditional updates, §6.9 Create responses
import crypto from 'node:crypto';
import config from '../config.js';
import { ApiError } from './errors.js';
import { floorToSecond, parseHttpDate, toHttpDate } from './time.js';

export function computeEtag(source) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(source)).digest('base64url');
  return `"${hash}"`;
}

function splitList(header) {
  return header.split(',').map((value) => value.trim());
}

function setValidators(res, etag, lastModified) {
  res.set('ETag', etag);
  res.set('Last-Modified', toHttpDate(floorToSecond(lastModified)));
}

function isNotModified(req, etag, lastModified) {
  const ifNoneMatch = req.get('If-None-Match');
  if (ifNoneMatch !== undefined) {
    if (ifNoneMatch.trim() === '*') {
      return true;
    }
    return splitList(ifNoneMatch).some((value) => value.replace(/^W\//, '') === etag);
  }
  const since = parseHttpDate(req.get('If-Modified-Since'));
  return since !== null && floorToSecond(lastModified) <= since;
}

// §6.7: every successful GET
export function sendWithCaching(req, res, body, lastModified, etagSource = body) {
  const etag = computeEtag(etagSource);
  setValidators(res, etag, lastModified);
  if (isNotModified(req, etag, lastModified)) {
    return res.status(304).end();
  }
  return res.status(200).json(body);
}

// §6.8: successful PUT
export function sendUpdated(res, body, lastModified) {
  setValidators(res, computeEtag(body), lastModified);
  return res.status(200).json(body);
}

// §6.9: path is relative to PUBLIC_BASE_URL
export function sendCreated(res, body, path, lastModified) {
  const url = `${config.publicBaseUrl}${path}`;
  setValidators(res, computeEtag(body), lastModified);
  res.set('Location', url);
  res.set('Content-Location', url);
  return res.status(201).json(body);
}

// §6.8: currentBody is the representation a GET would return now
export function checkIfMatch(req, currentBody) {
  const ifMatch = req.get('If-Match');
  if (ifMatch === undefined) {
    throw new ApiError(40303, 'The If-Match header is required for this request.');
  }
  const etag = computeEtag(currentBody);
  if (ifMatch.trim() !== '*' && !splitList(ifMatch).includes(etag)) {
    throw new ApiError(41201, 'The If-Match header does not match the current representation.');
  }
}
