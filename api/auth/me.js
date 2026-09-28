import { handler, send, sessionUserId, endSession } from '../../lib/http.js';
import { getStore, StoreNotConfigured } from '../../lib/store.js';
import { publicUser, keys } from '../../lib/auth.js';

// GET /api/auth/me -> 200 {ready, user|null}. Logged-out is a normal 200 so pages don't log errors.
export default handler(['GET'], async (req, res) => {
  let store, id;
  try {
    store = getStore();
    id = sessionUserId(req);
  } catch (e) {
    if (e instanceof StoreNotConfigured) return send(res, 200, { ready: false, user: null });
    throw e;
  }
  if (!id) return send(res, 200, { ready: true, user: null });
  const raw = await store.get(keys.user(id));
  if (!raw) { endSession(req, res); return send(res, 200, { ready: true, user: null }); }
  send(res, 200, { ready: true, user: publicUser(JSON.parse(raw)) });
});
