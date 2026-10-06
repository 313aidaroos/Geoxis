import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authContext } from '../lib/supabaseServer.js';
import provision from '../api/world/provision.js';
import assetsHandler from '../api/assets.js';
import { HttpTelemetryPoller, AssetDataStreamer } from '../src/streamSimulator.js';
import { safeNextPath, updatePassword, currentUser, TOKEN_KEY } from '../src/authClient.js';
import { snapshot } from '../lib/fleetEngine.js';
import { cixySystemPrompt } from '../lib/core.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const request = { method: 'POST', headers: { authorization: 'Bearer test-session' } };
const makeResponse = () => ({
  statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
  end(body) { this.body = JSON.parse(body); },
});
function backend(t, options = {}) {
  const env = { SUPABASE_URL: 'https://db.example.invalid', SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service', APIXIS_WORLD_KEY: 'test-world-key-at-least-24-chars', APIXIS_WORLD_API: 'https://world.example.invalid' };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  let user = { id: 'user-1', email: 'ops@example.test', email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', app_metadata: { apixis_sub: 'apixis-1' }, user_metadata: { full_name: 'Operator' }, ...options.user };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return json(user);
    if (url.includes('/rest/v1/profiles')) return json([{}]);
    if (url.includes('/rest/v1/tenants?')) return json([{ id: 'tenant-1', name: 'Example', slug: 'example-test' }]);
    if (url.includes('/rest/v1/tenant_memberships')) return json([{}]);
    if (url.includes('/rest/v1/current_asset_positions?')) return json([
      { tenant_id: 'tenant-1', external_id: 'own', latitude: 52, longitude: 4, heading: 0 },
      { tenant_id: 'tenant-2', external_id: 'other', latitude: 52, longitude: 4, heading: 0 },
    ]);
    if (url.endsWith('/api/agent/provision')) return json({ ok: true, agent: { id: 'agent-1', name: 'Operator' } });
    if (url.includes('/auth/v1/admin/users/')) {
      if (options.saveFails) return json({ error: 'unavailable' }, 503);
      user = { ...user, ...JSON.parse(init.body) };
      return json(user);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return calls;
}

test('verified Auth metadata is available only when explicitly requested by the server', async t => {
  backend(t);
  const publicContext = await authContext(request);
  assert.deepEqual(publicContext.user, { id: 'user-1', email: 'ops@example.test' });
  assert.equal(publicContext.authUser, undefined);
  const internal = await authContext(request, { includeAuthUser: true });
  assert.equal(internal.authUser.app_metadata.apixis_sub, 'apixis-1');
  assert.ok(internal.authUser.created_at);
});

test('new verified accounts provision once, persist metadata, and skip repeated hub calls', async t => {
  const calls = backend(t);
  const first = makeResponse(); await provision(request, first);
  assert.equal(first.statusCode, 200); assert.equal(first.body.status, 'ready');
  const payload = JSON.parse(calls.find(c => c.url.endsWith('/api/agent/provision')).init.body);
  assert.equal(payload.email_verified, true); assert.equal(payload.apixis_sub, 'apixis-1');
  const again = makeResponse(); await provision(request, again);
  assert.equal(again.body.status, 'ready');
  assert.equal(calls.filter(c => c.url.endsWith('/api/agent/provision')).length, 1);
});

test('failed metadata writes do not report successful onboarding', async t => {
  backend(t, { saveFails: true });
  const res = makeResponse(); await provision(request, res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.ok, false);
});

test('unverified accounts cannot provision a world agent', async t => {
  const calls = backend(t, { user: { email_confirmed_at: null, app_metadata: {} } });
  const res = makeResponse(); await provision(request, res);
  assert.equal(res.body.status, 'invite');
  assert.equal(calls.some(c => c.url.endsWith('/api/agent/provision')), false);
});

test('signed-in assets use the tenant and exclude other customer rows', async t => {
  const calls = backend(t);
  const res = makeResponse(); await assetsHandler({ ...request, method: 'GET' }, res);
  assert.deepEqual(res.body.assets.map(a => a.id), ['own']);
  assert.equal(res.body.sources.tenant, 'supabase');
  assert.ok(calls.find(c => c.url.includes('tenant_id=eq.tenant-1')));
});

function browserStorage(t) {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === TOKEN_KEY ? 'test-session' : null };
  t.after(() => { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; });
}

test('password update uses the existing app session and marks password setup complete', async t => {
  browserStorage(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return url === '/api/config' ? json({ supabaseUrl: 'https://db.example.invalid', supabaseAnonKey: 'anon' }) : json({ id: 'user-1' });
  });
  await currentUser();
  await updatePassword('test-only-password');
  const update = calls.find(c => c.init?.method === 'PUT');
  assert.equal(update.init.headers.Authorization, 'Bearer test-session');
  assert.deepEqual(JSON.parse(update.init.body), { password: 'test-only-password', data: { has_password: true } });
});

test('redirects reject external, encoded slash, backslash, and control-character destinations', () => {
  for (const input of ['https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%252fevil.test', '/\nevil.test', '/%0aevil.test', null]) {
    assert.equal(safeNextPath(input), '/');
  }
  assert.equal(safeNextPath('/pricing?from=login'), '/pricing?from=login');
});

function deadline() {
  return AbortSignal.timeout(1500);
}
function until(signal, subscribe) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Test timed out')), { once: true });
    subscribe(resolve, reject);
  });
}

test('HTTP poller sends session headers and connects only after a valid snapshot', async t => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  let headers;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { headers = init.headers; return response; });
  const poller = new HttpTelemetryPoller({ url: '/api/assets', intervalMs: 1000, getHeaders: () => ({ Authorization: 'Bearer test-session' }) });
  t.after(() => poller.close());
  let opened = false; poller.onopen = () => { opened = true; };
  assert.equal(opened, false);
  const received = until(deadline(), resolve => { poller.onmessage = event => resolve(JSON.parse(event.data)); });
  release(json({ assets: [], sentAt: 1, tenant: { id: 't1' } }));
  const message = await received;
  assert.equal(opened, true); assert.equal(headers.Authorization, 'Bearer test-session');
  assert.equal(message.channel, 'snapshot'); assert.deepEqual(message.payload.assets, []);
});

test('HTTP poller reports failed requests and recovers on the next successful poll', async t => {
  let requests = 0; let errors = 0;
  t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? json({}, 503) : json({ assets: [] }));
  const poller = new HttpTelemetryPoller({ url: '/api/assets', intervalMs: 10 });
  t.after(() => poller.close()); poller.onerror = () => errors++;
  await until(deadline(), resolve => { poller.onopen = resolve; });
  assert.equal(errors, 1); assert.equal(requests, 2);
});

test('streamer includes the app token for its own endpoint only', async t => {
  browserStorage(t);
  for (const endpoint of ['/api/assets', 'https://feed.example.invalid/assets']) {
    let actual;
    t.mock.method(globalThis, 'fetch', async (_url, init) => { actual = init.headers; return json({ assets: [] }); });
    let stream;
    await until(deadline(), resolve => {
      stream = new AssetDataStreamer({ endpoint, bus: { emit(name) { if (name === 'stream:snapshot') resolve(); } } });
      t.after(() => stream.disconnect()); stream.connect();
    });
    stream.disconnect();
    assert.equal(actual.Authorization, endpoint === '/api/assets' ? 'Bearer test-session' : undefined);
  }
});

test('demo fleet and stale aircraft are labelled, preserve fix time, and expire', async t => {
  let now = 1_900_000_000_000;
  t.mock.method(Date, 'now', () => now);
  let requests = 0;
  const state = ['abc123', 'TEST123', 'NL', now / 1000 - 20, now / 1000, 4, 52, 1000, false, 100, 90, 0, null, 1000];
  t.mock.method(globalThis, 'fetch', async () => {
    if (++requests > 1) throw new Error('upstream unavailable');
    return json({ states: [state] });
  });
  const first = await snapshot();
  assert.equal(first.sources.fleet, 'simulated');
  assert.equal(first.assets.filter(a => a.simulated).length, 6);
  const fix = first.assets.find(a => a.source === 'opensky').timestamp;
  assert.equal(Date.parse(fix), now - 20_000);
  now += 15_000;
  const stale = (await snapshot()).assets.find(a => a.source === 'opensky');
  assert.equal(stale.stale, true); assert.equal(stale.timestamp, fix);
  now += 5 * 60_000;
  assert.equal((await snapshot()).assets.some(a => a.source === 'opensky'), false);
});

test('Cixy receives the source and observation age instead of treating demo assets as real', () => {
  const prompt = cixySystemPrompt({ assets: [{ id: 'demo', source: 'geoxis-fleet', simulated: true, timestamp: '2026-10-05T00:00:00Z' }] });
  assert.match(prompt, /simulated=true/); assert.match(prompt, /observed=2026-10-05/);
  assert.match(prompt, /not real company telemetry/);
});
