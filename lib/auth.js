// Accounts: validation, password hashing (scrypt), signed session tokens, mailbox numbers.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { StoreNotConfigured, upstashConfig } from './store.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;

export const SESSION_COOKIE = 'gb_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_SEC = 10 * 60;

export const keys = {
  user: (id) => `gb:user:${id}`,
  email: (email) => `gb:email:${email}`,
  seq: 'gb:seq:mailbox',
  fails: (id) => `gb:fail:${id}`,
};

const RESERVED_IDS = new Set(['admin', 'administrator', 'root', 'system', 'gobaesong', 'support', 'help', 'api', 'null', 'undefined', 'master', 'manager']);
const RE = {
  id: /^[a-z][a-z0-9_]{3,19}$/,
  name: /^[A-Za-z][A-Za-z .'-]{1,39}$/,
  email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/,
};

export function validateSignup(body) {
  const b = body && typeof body === 'object' ? body : {};
  const id = String(b.id ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(b.email ?? '').trim().toLowerCase();
  const center = String(b.center ?? 'NJ').toUpperCase();
  const errors = {};
  if (!RE.id.test(id)) errors.id = '아이디는 영문 소문자로 시작하는 4–20자(소문자·숫자·_)입니다.';
  else if (RESERVED_IDS.has(id)) errors.id = '쓸 수 없는 아이디입니다.';
  if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = '비밀번호는 영문과 숫자를 섞어 8–64자로 입력해 주세요.';
  } else if (id && password.toLowerCase().includes(id)) {
    errors.password = '비밀번호에 아이디를 넣을 수 없습니다.';
  }
  if (!RE.name.test(name)) errors.name = '영문 이름을 입력해 주세요. 예: GILDONG HONG';
  if (!RE.email.test(email)) errors.email = '이메일 형식을 확인해 주세요.';
  if (!['NJ', 'DE'].includes(center)) errors.center = '센터를 선택해 주세요.';
  if (b.agree !== true) errors.agree = '이용약관과 개인정보 수집·이용에 동의해 주세요.';
  return { errors, value: { id, password, name: name.toUpperCase(), email, center } };
}

export function checkIdFormat(raw) {
  const id = String(raw ?? '').trim().toLowerCase();
  if (!RE.id.test(id)) return { id, ok: false, reason: '영문 소문자로 시작하는 4–20자(소문자·숫자·_)' };
  if (RESERVED_IDS.has(id)) return { id, ok: false, reason: '쓸 수 없는 아이디입니다.' };
  return { id, ok: true };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, SCRYPT_OPTS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_OPTS);
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// A fixed hash so a login for an unknown id costs the same scrypt work as a real one
let dummyHash = null;
export async function burnPasswordCheck(password) {
  dummyHash = dummyHash || (await hashPassword('dummy-password-0'));
  await verifyPassword(password, dummyHash);
}

export const mailboxOf = (n) => `GB-${String(n).padStart(6, '0')}`;

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, center: u.center, mailbox: u.mailbox, createdAt: u.createdAt };
}

/* ---------- Sessions: base64url(payload).hmac ---------- */
export function sessionSecret(env = process.env) {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  const up = upstashConfig(env);
  if (up) return crypto.createHash('sha256').update(`gb-session:${up.token}`).digest('hex');
  if (env.VERCEL) throw new StoreNotConfigured();
  return 'gb-local-dev-only-secret';
}

const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function createSession(id, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: id, iat: now, exp: now + SESSION_MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || typeof data.exp !== 'number' || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}
