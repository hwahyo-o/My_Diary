const encoder = new TextEncoder();
const MAX_NICKNAME_CODEPOINTS = 64;
const DEFAULT_JSON_BODY_LIMIT = 4096;
const MAX_ACTIVE_SESSIONS = 12;

export function json(data, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function normalizeNickname(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
}

export function isValidNickname(value) {
  return typeof value === 'string'
    && value.length > 0
    && Array.from(value).length <= MAX_NICKNAME_CODEPOINTS;
}

export function fromBase64Url(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError('Expected base64url string.');
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function hmacSha256(secret, bytes) {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
}

export function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function utf8(value) {
  return encoder.encode(value);
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseCookie(request, name) {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function hasAllowedOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readJsonBody(request, maxBytes = DEFAULT_JSON_BODY_LIMIT) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new RangeError('Request body is too large.');
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError('Request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    bytes.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

export async function authVerifier(env, authSecret) {
  const serverPepper = fromBase64Url(env.AUTH_PEPPER);
  try {
    if (serverPepper.length !== 32) throw new Error('AUTH_PEPPER must be 32 bytes.');
    return await hmacSha256(serverPepper, authSecret);
  } finally {
    serverPepper.fill(0);
  }
}

export async function createSession(env, accountId) {
  const token = randomBytes(32);
  let tokenHash;
  try {
    tokenHash = await sha256(token);
    const sessionId = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const cookieValue = toBase64Url(token);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE account_id = ? AND expires_at <= ?')
        .bind(accountId, createdAt),
      env.DB.prepare(
        'INSERT INTO sessions (session_id, account_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(sessionId, accountId, tokenHash, createdAt, expiresAt, createdAt),
    ]);

    await env.DB.prepare(
      `DELETE FROM sessions
       WHERE account_id = ?
         AND session_id NOT IN (
           SELECT session_id FROM sessions WHERE account_id = ? ORDER BY created_at DESC LIMIT ?
         )`,
    ).bind(accountId, accountId, MAX_ACTIVE_SESSIONS).run();

    return {
      cookie: `my_diary_session=${cookieValue}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
      expiresAt,
    };
  } finally {
    token.fill(0);
    tokenHash?.fill(0);
  }
}

export async function requireSession(request, env) {
  const tokenValue = parseCookie(request, 'my_diary_session');
  if (!tokenValue) return null;

  let token;
  let tokenHash;
  try {
    token = fromBase64Url(tokenValue);
    if (token.length !== 32) return null;
    tokenHash = await sha256(token);
    const row = await env.DB.prepare(
      'SELECT session_id, account_id, expires_at FROM sessions WHERE token_hash = ? LIMIT 1',
    ).bind(tokenHash).first();

    if (!row || typeof row.expires_at !== 'string') return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(row.session_id).run();
      return null;
    }

    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE session_id = ?')
      .bind(nowIso(), row.session_id)
      .run();

    return { sessionId: row.session_id, accountId: row.account_id };
  } catch {
    return null;
  } finally {
    token?.fill(0);
    tokenHash?.fill(0);
  }
}
