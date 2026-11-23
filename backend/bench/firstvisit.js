// First visit: every arrival opens a new connection and loads the page shell with its
// scripts and styles, as a browser with an empty cache does.
//   RATE (20, arrivals per second), DURATION (30s), SITE (BASE without /api)
import http from 'k6/http';
import { check } from 'k6';
import { BASE } from './lib.js';

const SITE = __ENV.SITE || BASE.replace(/\/api$/, '');

export const options = {
  scenarios: {
    arrivals: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 20),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
  noVUConnectionReuse: true,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const html = http.get(`${SITE}/`).body;
  return [...new Set(html.match(/\/assets\/[^"']+\.(?:js|css)/g))];
}

export default function (assets) {
  const params = { headers: { 'accept-encoding': 'gzip' } };
  const page = http.get(`${SITE}/`, { ...params, tags: { fn: 'html' } });
  const loaded = http.batch(
    assets.map((path) => ['GET', `${SITE}${path}`, null, { ...params, tags: { fn: 'assets' } }])
  );
  check(page, { html: (r) => r.status === 200 });
  check(loaded, { assets: (all) => all.every((r) => r.status === 200) });
}
