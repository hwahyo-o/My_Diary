import { authVerifier, hasAllowedOrigin, isValidNickname, json, normalizeNickname, readJsonBody, toBase64Url, utf8 } from '../../_shared/cloud-sync.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!hasAllowedOrigin(request)) return json({ error: 'Forbidden origin.' }, { status: 403 });
    const body = await readJsonBody(request);
    const nicknameNorm = normalizeNickname(body?.nickname);
    if (!isValidNickname(nicknameNorm)) return json({ error: 'Invalid nickname.' }, { status: 400 });

    const row = await env.DB.prepare(
      'SELECT account_salt FROM accounts WHERE nickname_norm = ? LIMIT 1',
    ).bind(nicknameNorm).first();

    if (row?.account_salt) {
      return json({ accountSalt: toBase64Url(new Uint8Array(row.account_salt)) });
    }

    const dummy = await authVerifier(env, utf8(`dummy-salt:${nicknameNorm}`));
    return json({ accountSalt: toBase64Url(dummy.slice(0, 32)) });
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }
}
