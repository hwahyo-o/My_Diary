import {
  authVerifier,
  constantTimeEqual,
  fromBase64Url,
  hasAllowedOrigin,
  json,
  readJsonBody,
  requireSession,
} from '../../_shared/cloud-sync.js';

async function deleteVaultObjects(bucket, accountId) {
  const prefix = `vault/${accountId}/`;
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function onRequestPost({ request, env }) {
  if (!hasAllowedOrigin(request)) return json({ error: 'Forbidden origin.' }, { status: 403 });

  const session = await requireSession(request, env);
  if (!session) return json({ error: 'Authentication failed.' }, { status: 401 });

  let authSecret;
  let actual;
  let expected;
  try {
    const body = await readJsonBody(request);
    authSecret = fromBase64Url(body?.authSecret);
    if (authSecret.length !== 32) return json({ error: 'Authentication failed.' }, { status: 401 });

    const row = await env.DB.prepare(
      'SELECT auth_verifier FROM accounts WHERE account_id = ? LIMIT 1',
    ).bind(session.accountId).first();
    if (!row?.auth_verifier) return json({ error: 'Authentication failed.' }, { status: 401 });

    actual = await authVerifier(env, authSecret);
    expected = new Uint8Array(row.auth_verifier);
    if (!constantTimeEqual(actual, expected)) {
      return json({ error: 'Authentication failed.' }, { status: 401 });
    }

    await deleteVaultObjects(env.VAULT_BUCKET, session.accountId);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(session.accountId),
      env.DB.prepare('DELETE FROM devices WHERE account_id = ?').bind(session.accountId),
      env.DB.prepare('DELETE FROM sync_heads WHERE account_id = ?').bind(session.accountId),
      env.DB.prepare('DELETE FROM accounts WHERE account_id = ?').bind(session.accountId),
    ]);

    const response = json({ ok: true });
    response.headers.append(
      'set-cookie',
      'my_diary_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    );
    return response;
  } catch {
    return json({ error: 'Account reset failed.' }, { status: 400 });
  } finally {
    authSecret?.fill(0);
    actual?.fill(0);
    expected?.fill(0);
  }
}
