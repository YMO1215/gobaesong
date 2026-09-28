// Key-value store behind the member API.
// Production: Upstash Redis over its REST API (Vercel Marketplace injects KV_REST_API_URL/TOKEN).
// Local dev and tests: a JSON file under .data/ (never used on Vercel, whose filesystem is ephemeral).
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class StoreNotConfigured extends Error {
  constructor() {
    super('Member store is not connected. Connect Upstash for Redis to this Vercel project (Storage tab) and redeploy.');
    this.name = 'StoreNotConfigured';
  }
}

export function upstashConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function upstashStore({ url, token, fetchImpl = globalThis.fetch }) {
  const endpoint = String(url).replace(/\/+$/, '');
  async function cmd(...args) {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error body: reported below with the status */ }
    if (!res.ok || data.error) throw new Error(`Upstash ${args[0]} failed: ${data.error || `HTTP ${res.status}`}`);
    return data.result;
  }
  return {
    kind: 'upstash',
    get: (k) => cmd('GET', k),
    set: (k, v) => cmd('SET', k, v),
    setNX: async (k, v) => (await cmd('SET', k, v, 'NX')) === 'OK',
    del: (k) => cmd('DEL', k),
    incr: async (k) => Number(await cmd('INCR', k)),
    // counter that opens a fixed window on its first hit (login throttling)
    incrWindow: async (k, ttlSec) => {
      const n = Number(await cmd('INCR', k));
      if (n === 1) await cmd('EXPIRE', k, ttlSec);
      return n;
    },
    ping: async () => (await cmd('PING')) === 'PONG',
  };
}

export function fileStore(file) {
  let chain = Promise.resolve();
  const load = async () => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  };
  const save = async (db) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 1));
    await fs.rename(tmp, file);
  };
  const live = (db, k) => {
    const e = db[k];
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) { delete db[k]; return null; }
    return e;
  };
  // serialize every operation so read-modify-write never interleaves within the process
  const tx = (fn) => {
    const run = chain.then(async () => { const db = await load(); const out = fn(db); await save(db); return out; });
    chain = run.catch(() => {});
    return run;
  };
  return {
    kind: 'file',
    get: (k) => tx((db) => { const e = live(db, k); return e ? e.v : null; }),
    set: (k, v) => tx((db) => { db[k] = { v: String(v) }; return 'OK'; }),
    setNX: (k, v) => tx((db) => { if (live(db, k)) return false; db[k] = { v: String(v) }; return true; }),
    del: (k) => tx((db) => { const had = !!live(db, k); delete db[k]; return had ? 1 : 0; }),
    incr: (k) => tx((db) => { const e = live(db, k); const n = (e ? Number(e.v) : 0) + 1; db[k] = { v: String(n), exp: e && e.exp }; return n; }),
    incrWindow: (k, ttlSec) => tx((db) => {
      const e = live(db, k);
      const n = (e ? Number(e.v) : 0) + 1;
      db[k] = { v: String(n), exp: e ? e.exp : Date.now() + ttlSec * 1000 };
      return n;
    }),
    ping: async () => true,
  };
}

let cached = null;
export function getStore(env = process.env) {
  if (cached) return cached;
  const up = upstashConfig(env);
  if (up) return (cached = upstashStore(up));
  if (env.VERCEL) throw new StoreNotConfigured();
  const dir = env.GB_DATA_DIR || path.join(process.cwd(), '.data');
  return (cached = fileStore(path.join(dir, 'dev-store.json')));
}

export function setStoreForTests(store) { cached = store; }
