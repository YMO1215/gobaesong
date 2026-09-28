import { handler, readJson, send, startSession } from '../../lib/http.js';
import { getStore } from '../../lib/store.js';
import { validateSignup, hashPassword, mailboxOf, publicUser, keys } from '../../lib/auth.js';

// POST /api/auth/signup {id, password, name, email, center, agree} -> 201 {user} + session cookie
export default handler(['POST'], async (req, res) => {
  const { errors, value } = validateSignup(await readJson(req));
  if (Object.keys(errors).length) return send(res, 400, { error: 'INVALID', message: '입력값을 확인해 주세요.', errors });

  const store = getStore();
  if (await store.get(keys.user(value.id))) {
    return send(res, 409, { error: 'ID_TAKEN', message: '이미 쓰이는 아이디입니다.', errors: { id: '이미 쓰이는 아이디입니다.' } });
  }
  if (!(await store.setNX(keys.email(value.email), value.id))) {
    return send(res, 409, { error: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.', errors: { email: '이미 가입된 이메일입니다.' } });
  }

  const user = {
    id: value.id,
    name: value.name,
    email: value.email,
    center: value.center,
    mailbox: mailboxOf(await store.incr(keys.seq)),
    createdAt: new Date().toISOString(),
    hash: await hashPassword(value.password),
  };
  // NX guards the race where two signups pass the existence check with the same id
  if (!(await store.setNX(keys.user(user.id), JSON.stringify(user)))) {
    await store.del(keys.email(value.email));
    return send(res, 409, { error: 'ID_TAKEN', message: '이미 쓰이는 아이디입니다.', errors: { id: '이미 쓰이는 아이디입니다.' } });
  }
  startSession(req, res, user.id);
  send(res, 201, { user: publicUser(user) });
});
