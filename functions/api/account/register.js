import {
  authVerifier,
  createSession,
  fromBase64Url,
  hasAllowedOrigin,
  isValidNickname,
  json,
  normalizeNickname,
  readJsonBody,
  nowIso,
  randomBytes,
  toBase64Url,
} from '../../_shared/cloud-sync.js';
import { encryptWithMasterKey } from '../../_shared/master-key.js';

export async function onRequestPost({ request, env }) {
  let accountSalt;
  let authSecret;
  let unlockPepper;
  let verifier;
  try {
    if (!hasAllowedOrigin(request)) return json({ error: 'Forbidden origin.' }, { status: 403 });
    const body = await readJsonBody(request);
    const nicknameNorm = normalizeNickname(body?.nickname);
    accountSalt = fromBase64Url(body?.accountSalt);
    authSecret = fromBase64Url(body?.authSecret);

    if (!isValidNickname(nicknameNorm) || accountSalt.length !== 32 || authSecret.length !== 32) {
      return json({ error: 'Invalid registration payload.' }, { status: 400 });
    }

    const existing = await env.DB.prepare(
      'SELECT account_id FROM accounts WHERE nickname_norm = ? LIMIT 1',
    ).bind(nicknameNorm).first();
    if (existing) return json({ error: 'Nickname is unavailable.' }, { status: 409 });

    const accountId = crypto.randomUUID();
    verifier = await authVerifier(env, authSecret);
    unlockPepper = randomBytes(32);
    const aad = `my-diary/unlock-pepper/v1/${accountId}`;
    const encryptedPepper = await encryptWithMasterKey(env.UNLOCK_MASTER_KEY, unlockPepper, aad);
    const timestamp = nowIso();

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO accounts (account_id, nickname_norm, account_salt, auth_verifier, unlock_pepper_ciphertext, unlock_pepper_iv, created_at, updated_at, failed_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
      ).bind(accountId, nicknameNorm, accountSalt, verifier, encryptedPepper.ciphertext, encryptedPepper.iv, timestamp, timestamp),
      env.DB.prepare(
        'INSERT INTO sync_heads (account_id, revision, object_key, object_sha256, updated_at) VALUES (?, 0, NULL, NULL, ?)',
      ).bind(accountId, timestamp),
    ]);

    const session = await createSession(env, accountId);
    const response = json({
      accountId,
      unlockPepper: toBase64Url(unlockPepper),
      revision: 0,
    });
    response.headers.append('set-cookie', session.cookie);
    return response;
  } catch {
    return json({ error: 'Registration failed.' }, { status: 400 });
  } finally {
    accountSalt?.fill(0);
    authSecret?.fill(0);
    unlockPepper?.fill(0);
    verifier?.fill(0);
  }
}
