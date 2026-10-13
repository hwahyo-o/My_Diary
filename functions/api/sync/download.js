import { json, requireSession } from '../../_shared/cloud-sync.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env);
  if (!session) return json({ error: 'Authentication failed.' }, { status: 401 });

  const head = await env.DB.prepare(
    'SELECT revision, object_key, object_sha256 FROM sync_heads WHERE account_id = ? LIMIT 1',
  ).bind(session.accountId).first();

  if (!head?.object_key || Number(head.revision ?? 0) === 0) {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }

  const object = await env.VAULT_BUCKET.get(head.object_key);
  if (!object) return json({ error: 'Encrypted cloud snapshot is missing.' }, { status: 503 });

  const headers = new Headers();
  headers.set('content-type', 'application/octet-stream');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('x-my-diary-revision', String(head.revision));
  headers.set('x-my-diary-sha256', String(head.object_sha256));
  return new Response(object.body, { headers });
}
