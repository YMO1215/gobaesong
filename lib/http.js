// Minimal request/response helpers shared by the /api functions.
// Written against plain Node req/res so the same handlers run on Vercel and in tools/dev-server.mjs.
import { StoreNotConfigured } from './store.js';
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession, readSession, sessionSecret } from './auth.js';

const BODY_LIMIT = 16 * 1024;

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

export async function readJson(req) {
  // Vercel pre-parses JSON into req.body; its getter throws on malformed JSON
  let pre;
  try { pre = req.body; } catch { throw new HttpError(400, 'BAD_JSON', '요청 형식이 올바르지 않습니다.'); }
  if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) return pre;
  let raw = typeof pre === 'string' ? pre : Buffer.isBuffer(pre) ? pre.toString('utf8') : '';
  if (!raw && pre === undefined) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > BODY_LIMIT) throw new HttpError(413, 'TOO_LARGE', '요청이 너무 큽니다.');
      chunks.push(c);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'BAD_JSON', '요청 형식이 올바르지 않습니다.'); }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed cookie: ignore */ }
    }
  }
  return out;
}

function isHttps(req) {
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || !!process.env.VERCEL;
}

function cookie(req, value, maxAge) {
  return [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, isHttps(req) ? 'Secure' : '']
    .filter(Boolean).join('; ');
}

export function startSession(req, res, id) {
  res.setHeader('Set-Cookie', cookie(req, createSession(id, sessionSecret()), SESSION_MAX_AGE));
}
export function endSession(req, res) {
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}
export function sessionUserId(req) {
  const s = readSession(parseCookies(req)[SESSION_COOKIE], sessionSecret());
  return s ? s.sub : null;
}

// Cookie auth + JSON-only POST + same-origin check keeps cross-site form posts out
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try { return new URL(origin).host === host; } catch { return false; }
}

export function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        return send(res, 405, { error: 'METHOD', message: '허용되지 않은 요청입니다.' }, { Allow: methods.join(', ') });
      }
      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').includes('application/json')) {
          return send(res, 415, { error: 'CONTENT_TYPE', message: 'JSON 요청만 받습니다.' });
        }
        if (!sameOrigin(req)) return send(res, 403, { error: 'ORIGIN', message: '다른 사이트에서 온 요청입니다.' });
      }
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message, ...e.extra });
      if (e instanceof StoreNotConfigured) {
        return send(res, 503, { error: 'STORE_NOT_CONFIGURED', message: '회원 저장소가 아직 연결되지 않았습니다. 관리자에게 알려 주세요.' });
      }
      console.error('[api]', req.method, req.url, e);
      return send(res, 500, { error: 'SERVER', message: '잠시 후 다시 시도해 주세요.' });
    }
  };
}

export function queryParam(req, name) {
  if (req.query && req.query[name] !== undefined) return String(req.query[name]);
  return new URL(req.url, 'http://local').searchParams.get(name);
}
