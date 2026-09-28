import { handler, send } from '../lib/http.js';
import { getStore, StoreNotConfigured } from '../lib/store.js';

// GET /api/health -> which member store is connected and whether it answers (no secrets exposed)
export default handler(['GET'], async (req, res) => {
  try {
    const store = getStore();
    const ok = await store.ping();
    send(res, ok ? 200 : 503, { ok, store: store.kind });
  } catch (e) {
    if (e instanceof StoreNotConfigured) return send(res, 503, { ok: false, store: null, message: 'Upstash 미연결' });
    send(res, 503, { ok: false, store: 'upstash', message: String(e.message).slice(0, 160) });
  }
});
