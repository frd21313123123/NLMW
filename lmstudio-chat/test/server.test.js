const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlmw-chat-test-'));
process.env.APP_DATA_DIR = testDataDir;
process.env.SESSION_SECRET = 'test-session-secret';

const { app, stripSlashes, deriveRestBaseUrl, deriveOpenAiBaseUrl } = require('../server');
const authFile = path.join(testDataDir, 'auth.json');

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

function startTestServer() {
  const server = app.listen(0);
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function closeTestServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function createSessionCookie(baseUrl, login = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, name: 'Test User', password: 'secret123' })
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /nlmw_session=/);
  return cookie.split(';')[0];
}

async function readStreamUntil(reader, pattern, timeoutMs = 3000) {
  const decoder = new TextDecoder();
  let text = '';
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    const remaining = Math.max(1, expiresAt - Date.now());
    const read = reader.read();
    const result = await Promise.race([
      read,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for SSE event')), remaining))
    ]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
    if (text.includes(pattern)) return text;
  }
  throw new Error(`Missing SSE pattern: ${pattern}`);
}

function resetAuthStore() {
  fs.rmSync(authFile, { force: true });
}

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
  const { server, baseUrl } = startTestServer();

  try {
    const cookie = await createSessionCookie(baseUrl);
    const res = await fetch(`${baseUrl}/api/video/preview`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Missing url query param');
  } finally {
    await closeTestServer(server);
  }
});

test('GET /api/video/preview validates invalid url format', async () => {
  const { server, baseUrl } = startTestServer();

  try {
    const cookie = await createSessionCookie(baseUrl);
    const res = await fetch(`${baseUrl}/api/video/preview?url=not-a-url`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid url');
  } finally {
    await closeTestServer(server);
  }
});

test('auth registration, duplicate rejection, login, and /me session lookup', async () => {
  const { server, baseUrl } = startTestServer();
  const login = `auth-${Date.now()}@example.com`;

  try {
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, name: 'Auth User', password: 'secret123' })
    });
    assert.equal(registerRes.status, 201);
    const registerBody = await registerRes.json();
    assert.equal(registerBody.user.login, login);

    const duplicateRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, name: 'Auth User', password: 'secret123' })
    });
    assert.equal(duplicateRes.status, 409);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password: 'secret123' })
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.login, login);
    assert.equal(typeof meBody.user.isAdmin, 'boolean');
  } finally {
    await closeTestServer(server);
  }
});

test('first registered user is admin and can toggle registration', async () => {
  resetAuthStore();
  const { server, baseUrl } = startTestServer();

  try {
    const adminRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin@example.com', name: 'Admin', password: 'secret123' })
    });
    assert.equal(adminRes.status, 201);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.user.role, 'admin');
    assert.equal(adminBody.user.isAdmin, true);
    const adminCookie = adminRes.headers.get('set-cookie').split(';')[0];

    const closeRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ registrationEnabled: false })
    });
    assert.equal(closeRes.status, 200);
    const closeBody = await closeRes.json();
    assert.equal(closeBody.settings.registrationEnabled, false);

    const blockedRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'blocked@example.com', name: 'Blocked', password: 'secret123' })
    });
    assert.equal(blockedRes.status, 403);

    const openRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ registrationEnabled: true })
    });
    assert.equal(openRes.status, 200);

    const userRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'regular@example.com', name: 'Regular', password: 'secret123' })
    });
    assert.equal(userRes.status, 201);
    const userBody = await userRes.json();
    assert.equal(userBody.user.role, 'user');
    assert.equal(userBody.user.isAdmin, false);
    const userCookie = userRes.headers.get('set-cookie').split(';')[0];

    const forbiddenRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ registrationEnabled: false })
    });
    assert.equal(forbiddenRes.status, 403);
  } finally {
    await closeTestServer(server);
  }
});

test('POST /api/characters/bulk replace overwrites server character storage', async () => {
  const { server, baseUrl } = startTestServer();

  try {
    const cookie = await createSessionCookie(baseUrl);
    const firstRes = await fetch(`${baseUrl}/api/characters/bulk?replace=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify([
        { id: 'replace-old', name: 'Old Character', gender: 'female', updatedAt: 1 }
      ])
    });
    assert.equal(firstRes.status, 200);

    const replaceRes = await fetch(`${baseUrl}/api/characters/bulk?replace=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        replace: true,
        characters: [{ id: 'replace-new', name: 'New Character', gender: 'male', updatedAt: 2 }]
      })
    });
    assert.equal(replaceRes.status, 200);
    const replaceBody = await replaceRes.json();
    assert.equal(replaceBody.count, 1);

    const getRes = await fetch(`${baseUrl}/api/characters`, { headers: { Cookie: cookie } });
    assert.equal(getRes.status, 200);
    const chars = await getRes.json();
    assert.deepEqual(chars.map((c) => c.id), ['replace-new']);
  } finally {
    await closeTestServer(server);
  }
});

test('user data is stored on server and isolated per account', async () => {
  const { server, baseUrl } = startTestServer();

  try {
    const cookieA = await createSessionCookie(baseUrl, `data-a-${Date.now()}@example.com`);
    const cookieB = await createSessionCookie(baseUrl, `data-b-${Date.now()}@example.com`);
    const data = {
      profile: { name: 'Desktop User', gender: 'unspecified', avatar: '' },
      selectedCharacterId: 'char-1',
      modelId: 'openrouter/test-model',
      provider: 'openrouter',
      conversations: {
        'char-1': {
          activeChatId: 'chat-1',
          chats: [
            {
              id: 'chat-1',
              title: 'Phone sync',
              createdAt: 10,
              updatedAt: 20,
              messages: [{ id: 'msg-1', role: 'user', content: 'hello from desktop', ts: 20 }]
            }
          ]
        }
      },
      responseIds: { 'chat-1': 'resp-1' },
      responseIdChains: { 'chat-1': ['resp-1'] },
      cloudDialogsPushedAt: 12345,
      savedPrompts: [{ id: 'prompt-1', title: 'Prompt', text: 'Use this', createdAt: 1, updatedAt: 2 }],
      promptFolders: [{ id: 'folder-1', name: 'Folder', createdAt: 1 }],
      groupChats: [],
      activeGroupChatId: '',
      polybuzzSettings: { pageSize: 50, autoload: false, genderAccuracy: 'precise' }
    };

    const saveRes = await fetch(`${baseUrl}/api/user-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ data })
    });
    assert.equal(saveRes.status, 200);

    const loadA = await fetch(`${baseUrl}/api/user-data`, { headers: { Cookie: cookieA } });
    assert.equal(loadA.status, 200);
    const bodyA = await loadA.json();
    assert.equal(bodyA.empty, false);
    assert.equal(bodyA.data.conversations['char-1'].chats[0].messages[0].content, 'hello from desktop');
    assert.equal(bodyA.data.responseIdChains['chat-1'][0], 'resp-1');
    assert.equal(bodyA.data.cloudDialogsPushedAt, 12345);
    assert.equal(bodyA.data.provider, 'openrouter');
    assert.equal(bodyA.data.modelId, 'openrouter/test-model');
    assert.equal(bodyA.data.savedPrompts[0].id, 'prompt-1');
    assert.equal(bodyA.data.promptFolders[0].id, 'folder-1');
    assert.equal(bodyA.data.polybuzzSettings.genderAccuracy, 'precise');

    const loadB = await fetch(`${baseUrl}/api/user-data`, { headers: { Cookie: cookieB } });
    assert.equal(loadB.status, 200);
    const bodyB = await loadB.json();
    assert.equal(bodyB.empty, true);
    assert.deepEqual(bodyB.data.conversations, {});
  } finally {
    await closeTestServer(server);
  }
});

test('user data save pushes live event to connected account devices', async () => {
  const { server, baseUrl } = startTestServer();
  const ac = new AbortController();

  try {
    const cookie = await createSessionCookie(baseUrl, `events-${Date.now()}@example.com`);
    const eventsRes = await fetch(`${baseUrl}/api/live/events`, {
      headers: { Cookie: cookie },
      signal: ac.signal
    });
    assert.equal(eventsRes.status, 200);
    assert.match(eventsRes.headers.get('content-type') || '', /text\/event-stream/);
    const reader = eventsRes.body.getReader();
    await readStreamUntil(reader, 'event: ready');

    const saveRes = await fetch(`${baseUrl}/api/user-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        data: {
          profile: { name: 'Live User', gender: 'unspecified', avatar: '' },
          conversations: {}
        }
      })
    });
    assert.equal(saveRes.status, 200);

    const text = await readStreamUntil(reader, 'event: user-data');
    assert.match(text, /"type":"user-data"/);
  } finally {
    ac.abort();
    await closeTestServer(server);
  }
});

test('GET /api/auth/me and protected APIs reject anonymous requests', async () => {
  const { server, baseUrl } = startTestServer();

  try {
    const meRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(meRes.status, 401);

    const charsRes = await fetch(`${baseUrl}/api/characters`);
    assert.equal(charsRes.status, 401);

    const dataRes = await fetch(`${baseUrl}/api/user-data`);
    assert.equal(dataRes.status, 401);
  } finally {
    await closeTestServer(server);
  }
});
