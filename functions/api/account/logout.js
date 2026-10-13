import { fromBase64Url, hasAllowedOrigin, json, parseCookie, sha256 } from '../../_shared/cloud-sync.js';

export async function onRequestPost({ request, env }) {
  if (!hasAllowedOrigin(request)) return json({ error: 'Forbidden origin.' }, { status: 403 });
  const tokenValue = parseCookie(request, 'my_diary_session');
  if (tokenValue) {
    try {
      const tokenHash = await sha256(fromBase64Url(tokenValue));
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    } catch {
      // Clear the browser cookie even when token cleanup cannot be completed.
    }
  }

  const response = json({ ok: true });
  response.headers.append(
    'set-cookie',
    'my_diary_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
  );
  return response;
}
