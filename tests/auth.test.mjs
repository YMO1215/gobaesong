// Member API end-to-end over HTTP against tools/dev-server.mjs with a throwaway data dir,
// plus the Upstash adapter against a fake Redis REST endpoint.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upstashStore } from '../lib/store.js';
import { createSession, readSession, hashPassword, verifyPassword, validateSignup } from '../lib/auth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server, base, dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'gb-test-'));
  server = spawn(process.execPath, ['tools/dev-server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0', GB_DATA_DIR: dataDir, KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', VERCEL: '' } });
  base = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('dev server did not start')), 10000);
    server.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/[\d.]+:\d+/); if (m) { clearTimeout(t); resolve(m[0]); } });
    server.stderr.on('data', (d) => process.stderr.write(d));
  });
});
after(async () => { server?.kill(); await rm(dataDir, { recursive: true, force: true }); });

async function call(p, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data: await res.json().catch(() => null), cookie: setCookie ? setCookie.split(';')[0] : null, setCookie };
}

const alice = { id: 'alice01', password: 'passw0rd!', name: 'Alice Kim', email: 'alice@example.com', center: 'NJ', agree: true };

test('health reports the local file store', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, store: 'file' });
});

test('logged-out /me is a normal 200 with no user', async () => {
  const r = await call('/api/auth/me');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ready: true, user: null });
});

test('signup validates every field', async () => {
  const r = await call('/api/auth/signup', { method: 'POST', body: { id: 'A', password: 'short', name: '홍길동', email: 'x', agree: false } });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.data.errors).sort(), ['agree', 'email', 'id', 'name', 'password']);
});

let aliceCookie;
test('signup creates the account, issues GB-000001 and logs in', async () => {
  const r = await call('/api/auth/signup', { method: 'POST', body: alice });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.id, 'alice01');
  assert.equal(r.data.user.name, 'ALICE KIM');
  assert.equal(r.data.user.mailbox, 'GB-000001');
  assert.equal(r.data.user.hash, undefined, 'password hash must never leave the server');
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  aliceCookie = r.cookie;
  const me = await call('/api/auth/me', { cookie: aliceCookie });
  assert.equal(me.data.user.mailbox, 'GB-000001');
});

test('mailbox numbers are sequential and ids/emails unique', async () => {
  const bob = await call('/api/auth/signup', { method: 'POST', body: { ...alice, id: 'bob_02', email: 'bob@example.com' } });
  assert.equal(bob.data.user.mailbox, 'GB-000002');
  const dupId = await call('/api/auth/signup', { method: 'POST', body: { ...alice, email: 'other@example.com' } });
  assert.equal(dupId.status, 409);
  assert.equal(dupId.data.error, 'ID_TAKEN');
  const dupMail = await call('/api/auth/signup', { method: 'POST', body: { ...alice, id: 'carol03', email: 'ALICE@example.com' } });
  assert.equal(dupMail.status, 409);
  assert.equal(dupMail.data.error, 'EMAIL_TAKEN');
});

test('check-id reports availability', async () => {
  assert.equal((await call('/api/auth/check-id?id=alice01')).data.available, false);
  assert.equal((await call('/api/auth/check-id?id=newbie9')).data.available, true);
  assert.equal((await call('/api/auth/check-id?id=admin')).data.available, false);
});

test('logout clears the cookie; login works with the right password only', async () => {
  const out = await call('/api/auth/logout', { method: 'POST', body: {}, cookie: aliceCookie });
  assert.match(out.setCookie, /Max-Age=0/);
  const bad = await call('/api/auth/login', { method: 'POST', body: { id: 'alice01', password: 'wrong-pass1' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.attemptsLeft, 4);
  const good = await call('/api/auth/login', { method: 'POST', body: { id: 'ALICE01', password: alice.password } });
  assert.equal(good.status, 200);
  assert.equal(good.data.user.id, 'alice01');
  assert.ok(good.cookie);
});

test('five wrong passwords lock the id for ten minutes', async () => {
  for (let i = 0; i < 5; i++) await call('/api/auth/login', { method: 'POST', body: { id: 'bob_02', password: 'nope-nope1' } });
  const locked = await call('/api/auth/login', { method: 'POST', body: { id: 'bob_02', password: alice.password } });
  assert.equal(locked.status, 429);
});

test('tampered or foreign cookies are ignored', async () => {
  const forged = aliceCookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await call('/api/auth/me', { cookie: forged })).data.user, null);
  const other = 'gb_session=' + createSession('alice01', 'some-other-secret');
  assert.equal((await call('/api/auth/me', { cookie: other })).data.user, null);
});

test('POST guards: JSON only, same origin only, method check', async () => {
  const form = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'id=a&password=b' });
  assert.equal(form.status, 415);
  const cross = await call('/api/auth/login', { method: 'POST', body: { id: 'alice01', password: alice.password }, headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  assert.equal((await call('/api/auth/signup')).status, 405);
});

test('static pages are served with clean URLs', async () => {
  const r = await fetch(base + '/apply');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /배송대행 신청/);
  assert.equal((await fetch(base + '/lib/auth.js')).status, 404, 'server code must not be served as static');
});

/* ---------- unit ---------- */
test('password hashing and sessions', async () => {
  const h = await hashPassword('abc12345');
  assert.ok(await verifyPassword('abc12345', h));
  assert.ok(!(await verifyPassword('abc12346', h)));
  const t = createSession('x1', 's', 1000);
  assert.equal(readSession(t, 's', 2000).sub, 'x1');
  assert.equal(readSession(t, 's', 1000 + 31 * 864e5), null, 'expired');
  assert.equal(readSession(t, 't', 2000), null, 'wrong secret');
  assert.equal(validateSignup({ ...alice, password: 'alice01abc9' }).errors.password, '비밀번호에 아이디를 넣을 수 없습니다.');
});

test('upstash adapter speaks the Redis REST protocol', async () => {
  const db = new Map();
  const calls = [];
  const fakeFetch = async (url, init) => {
    assert.equal(url, 'https://kv.example');
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const [cmd, k, v, flag] = JSON.parse(init.body);
    calls.push(cmd);
    let result = null;
    if (cmd === 'GET') result = db.get(k) ?? null;
    if (cmd === 'SET') { if (flag === 'NX' && db.has(k)) result = null; else { db.set(k, v); result = 'OK'; } }
    if (cmd === 'DEL') result = db.delete(k) ? 1 : 0;
    if (cmd === 'INCR') { const n = Number(db.get(k) || 0) + 1; db.set(k, String(n)); result = n; }
    if (cmd === 'EXPIRE') result = 1;
    if (cmd === 'PING') result = 'PONG';
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
  const s = upstashStore({ url: 'https://kv.example/', token: 'tok', fetchImpl: fakeFetch });
  assert.equal(await s.ping(), true);
  assert.equal(await s.setNX('a', '1'), true);
  assert.equal(await s.setNX('a', '2'), false);
  assert.equal(await s.get('a'), '1');
  assert.equal(await s.incr('n'), 1);
  assert.equal(await s.incrWindow('f', 600), 1);
  assert.equal(await s.incrWindow('f', 600), 2);
  assert.equal(calls.filter((c) => c === 'EXPIRE').length, 1, 'window starts only once');
  const failing = upstashStore({ url: 'https://kv.example', token: 'tok', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS' }) }) });
  await assert.rejects(() => failing.get('a'), /WRONGPASS/);
});
