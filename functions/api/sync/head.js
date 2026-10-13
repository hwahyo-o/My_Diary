import { json, requireSession } from '../../_shared/cloud-sync.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env);
  if (!session) return json({ error: 'Authentication failed.' }, { status: 401 });

  const row = await env.DB.prepare(
    'SELECT revision, object_sha256, updated_at FROM sync_heads WHERE account_id = ? LIMIT 1',
  ).bind(session.accountId).first();

  return json({
    revision: Number(row?.revision ?? 0),
    objectSha256: row?.object_sha256 ?? null,
    updatedAt: row?.updated_at ?? null,
  });
}
