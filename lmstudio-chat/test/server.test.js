const test = require('node:test');
const assert = require('node:assert/strict');

const { app, stripSlashes, deriveRestBaseUrl, deriveOpenAiBaseUrl } = require('../server');

test('stripSlashes removes trailing slashes', () => {
  assert.equal(stripSlashes('http://localhost:1234/v1///'), 'http://localhost:1234/v1');
});

test('deriveRestBaseUrl supports /v1 and /api/v1', () => {
  assert.equal(deriveRestBaseUrl('http://localhost:1234/v1'), 'http://localhost:1234');
  assert.equal(deriveRestBaseUrl('http://localhost:1234/api/v1/'), 'http://localhost:1234');
  assert.equal(deriveRestBaseUrl('http://localhost:1234/custom'), 'http://localhost:1234/custom');
});

test('deriveOpenAiBaseUrl always points to /v1', () => {
  assert.equal(deriveOpenAiBaseUrl('http://localhost:1234/api/v1'), 'http://localhost:1234/v1');
  assert.equal(deriveOpenAiBaseUrl('http://localhost:1234/v1'), 'http://localhost:1234/v1');
});

test('GET /api/video/preview validates missing url', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/video/preview`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Missing url query param');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/video/preview validates invalid url format', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/video/preview?url=not-a-url`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid url');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
