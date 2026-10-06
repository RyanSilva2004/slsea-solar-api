// §6.4 Collections and pagination
import config from '../config.js';

const API_PREFIX = '/solar/v1.0';
const DEFAULT_LIMIT = 20;

// query: the result of readQuery (§6.5)
export function paging(query) {
  return { offset: query.offset ?? 0, limit: query.limit ?? DEFAULT_LIMIT };
}

function pageLink(req, offset, limit) {
  const url = new URL(req.originalUrl, 'http://localhost');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  const path = url.pathname.slice(API_PREFIX.length);
  return `${config.publicBaseUrl}${path}?${url.searchParams}`;
}

export function collection(req, { count, items, offset, limit }) {
  return {
    count,
    next: offset + limit < count ? pageLink(req, offset + limit, limit) : null,
    previous: offset > 0 ? pageLink(req, Math.max(0, offset - limit), limit) : null,
    items,
  };
}
