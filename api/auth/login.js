import { handler, readJson, send, startSession } from '../../lib/http.js';
import { getStore } from '../../lib/store.js';
import { verifyPassword, burnPasswordCheck, publicUser, keys, LOGIN_MAX_FAILS, LOGIN_LOCK_SEC } from '../../lib/auth.js';

const WRONG = { error: 'BAD_CREDENTIALS', message: '아이디 또는 비밀번호가 맞지 않습니다.' };

// POST /api/auth/login {id, password} -> 200 {user} + session cookie
export default handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const id = String(body.id ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!id || !password || id.length > 20 || password.length > 64) return send(res, 400, { error: 'INVALID', message: '아이디와 비밀번호를 입력해 주세요.' });

  const store = getStore();
  const fails = Number((await store.get(keys.fails(id))) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    return send(res, 429, { error: 'LOCKED', message: `비밀번호를 ${LOGIN_MAX_FAILS}번 틀려 10분 동안 로그인이 막혔습니다.` });
  }

  const raw = await store.get(keys.user(id));
  const user = raw ? JSON.parse(raw) : null;
  const ok = user ? await verifyPassword(password, user.hash) : (await burnPasswordCheck(password), false);
  if (!ok) {
    const n = await store.incrWindow(keys.fails(id), LOGIN_LOCK_SEC);
    const left = Math.max(0, LOGIN_MAX_FAILS - n);
    return send(res, 401, { ...WRONG, message: left ? `${WRONG.message} (남은 시도 ${left}번)` : WRONG.message, attemptsLeft: left });
  }
  await store.del(keys.fails(id));
  startSession(req, res, user.id);
  send(res, 200, { user: publicUser(user) });
});
