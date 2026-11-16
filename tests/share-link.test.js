import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildShareUrl } from '../src/ui/share-url.js';

const base = { origin: 'https://example.test', pathname: '/solar/' };

test('a share link carries the date and the body', () => {
  const u = new URL(buildShareUrl({ ...base, dateISO: '2024-04-08', bodyKey: 'mars' }));
  assert.equal(u.searchParams.get('date'), '2024-04-08');
  assert.equal(u.searchParams.get('body'), 'mars');
});

test('a share link always skips the intro', () => {
  const u = new URL(buildShareUrl({ ...base, dateISO: '2024-04-08' }));
  assert.equal(u.searchParams.get('tour'), '0');
});

test('no body means no body parameter', () => {
  const u = new URL(buildShareUrl({ ...base, dateISO: '2024-04-08', bodyKey: null }));
  assert.equal(u.searchParams.has('body'), false);
});

test('the base path survives', () => {
  const u = new URL(buildShareUrl({ ...base, dateISO: '2000-01-01' }));
  assert.equal(u.origin, 'https://example.test');
  assert.equal(u.pathname, '/solar/');
});
