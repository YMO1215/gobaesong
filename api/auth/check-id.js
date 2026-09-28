import { handler, send, queryParam } from '../../lib/http.js';
import { getStore } from '../../lib/store.js';
import { checkIdFormat, keys } from '../../lib/auth.js';

// GET /api/auth/check-id?id=xxx -> {id, available, reason?}
export default handler(['GET'], async (req, res) => {
  const f = checkIdFormat(queryParam(req, 'id'));
  if (!f.ok) return send(res, 200, { id: f.id, available: false, reason: f.reason });
  const taken = !!(await getStore().get(keys.user(f.id)));
  send(res, 200, { id: f.id, available: !taken, reason: taken ? '이미 쓰이는 아이디입니다.' : undefined });
});
