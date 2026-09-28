import { handler, send } from '../lib/http.js';
import { getStore, StoreNotConfigured, upstashConfig, storeEnvNames } from '../lib/store.js';

// GET /api/health -> which member store is connected and whether it answers.
// Reports env var NAMES only (never values) so a missing/misnamed integration can be diagnosed.
export default handler(['GET'], async (req, res) => {
  const cfg = upstashConfig();
  const diag = { envVars: storeEnvNames(), using: cfg ? cfg.source : null, deploy: process.env.VERCEL_ENV || 'local' };
  try {
    const store = getStore();
    const ok = await store.ping();
    send(res, ok ? 200 : 503, { ok, store: store.kind, ...diag });
  } catch (e) {
    if (e instanceof StoreNotConfigured) return send(res, 503, { ok: false, store: null, message: 'Upstash 미연결', ...diag });
    send(res, 503, { ok: false, store: 'upstash', message: String(e.message).slice(0, 160), ...diag });
  }
});
