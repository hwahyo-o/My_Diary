import {
  authVerifier,
  constantTimeEqual,
  createSession,
  fromBase64Url,
  hasAllowedOrigin,
  isValidNickname,
  json,
  normalizeNickname,
  readJsonBody,
  nowIso,
  toBase64Url,
} from '../../_shared/cloud-sync.js';
import { decryptWithMasterKey } from '../../_shared/master-key.js';

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  let authSecret;
  let actual;
  let expected;
  let unlockPepper;
  try {
    if (!hasAllowedOrigin(request)) return json({ error: 'Forbidden origin.' }, { status: 403 });
    const body = await readJsonBody(request);
    const nicknameNorm = normalizeNickname(body?.nickname);
    authSecret = fromBase64Url(body?.authSecret);
    if (!isValidNickname(nicknameNorm) || authSecret.length !== 32) {
      return json({ error: 'Authentication failed.' }, { status: 401 });
    }

    const row = await env.DB.prepare(
      'SELECT account_id, auth_verifier, unlock_pepper_ciphertext, unlock_pepper_iv, failed_attempts, locked_until FROM accounts WHERE nickname_norm = ? LIMIT 1',
    ).bind(nicknameNorm).first();

    if (!row) return json({ error: 'Authentication failed.' }, { status: 401 });
    if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
      return json({ error: 'Authentication temporarily locked.' }, { status: 429 });
    }

    actual = await authVerifier(env, authSecret);
    expected = new Uint8Array(row.auth_verifier);
    if (!constantTimeEqual(actual, expected)) {
      const failures = Number(row.failed_attempts ?? 0) + 1;
      const lockedUntil = failures >= MAX_FAILURES
        ? new Date(Date.now() + LOCK_MS).toISOString()
        : null;
      await env.DB.prepare(
        'UPDATE accounts SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE account_id = ?',
      ).bind(failures, lockedUntil, nowIso(), row.account_id).run();
      return json({ error: 'Authentication failed.' }, { status: 401 });
    }

    await env.DB.prepare(
      'UPDATE accounts SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE account_id = ?',
    ).bind(nowIso(), row.account_id).run();

    const aad = `my-diary/unlock-pepper/v1/${row.account_id}`;
    unlockPepper = await decryptWithMasterKey(
      env.UNLOCK_MASTER_KEY,
      new Uint8Array(row.unlock_pepper_iv),
      new Uint8Array(row.unlock_pepper_ciphertext),
      aad,
    );
    const head = await env.DB.prepare(
      'SELECT revision FROM sync_heads WHERE account_id = ? LIMIT 1',
    ).bind(row.account_id).first();

    const session = await createSession(env, row.account_id);
    const response = json({
      accountId: row.account_id,
      unlockPepper: toBase64Url(unlockPepper),
      revision: Number(head?.revision ?? 0),
    });
    response.headers.append('set-cookie', session.cookie);
    return response;
  } catch {
    return json({ error: 'Authentication failed.' }, { status: 401 });
  } finally {
    authSecret?.fill(0);
    actual?.fill(0);
    expected?.fill(0);
    unlockPepper?.fill(0);
  }
}
