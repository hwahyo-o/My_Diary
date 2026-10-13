import { hasAllowedOrigin, json, requireSession, sha256 } from '../../_shared/cloud-sync.js';

const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;

export async function onRequestPut({ request, env }) {
  if (!hasAllowedOrigin(request)) return json({ error: 'Forbidden origin.' }, { status: 403 });
  const session = await requireSession(request, env);
  if (!session) return json({ error: 'Authentication failed.' }, { status: 401 });

  const expectedRevision = Number(request.headers.get('x-my-diary-expected-revision'));
  const objectSha256 = request.headers.get('x-my-diary-sha256')?.trim().toLowerCase() ?? '';
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !/^[a-f0-9]{64}$/.test(objectSha256)) {
    return json({ error: 'Invalid sync headers.' }, { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SNAPSHOT_BYTES) {
    return json({ error: 'Invalid snapshot size.' }, { status: 413 });
  }
  const actualDigest = [...await sha256(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (actualDigest !== objectSha256) {
    return json({ error: 'Snapshot digest mismatch.' }, { status: 400 });
  }

  const head = await env.DB.prepare(
    'SELECT revision, object_key FROM sync_heads WHERE account_id = ? LIMIT 1',
  ).bind(session.accountId).first();
  const currentRevision = Number(head?.revision ?? 0);
  if (currentRevision !== expectedRevision) {
    return json({ error: 'Sync revision conflict.' }, { status: 409 });
  }

  const nextRevision = currentRevision + 1;
  const objectKey = `vault/${session.accountId}/${nextRevision}-${crypto.randomUUID()}.bin`;
  await env.VAULT_BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: {
      accountId: session.accountId,
      revision: String(nextRevision),
      sha256: objectSha256,
    },
  });

  const updatedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    'UPDATE sync_heads SET revision = ?, object_key = ?, object_sha256 = ?, updated_at = ? WHERE account_id = ? AND revision = ?',
  ).bind(nextRevision, objectKey, objectSha256, updatedAt, session.accountId, expectedRevision).run();

  if (Number(result.meta?.changes ?? 0) !== 1) {
    await env.VAULT_BUCKET.delete(objectKey);
    return json({ error: 'Sync revision conflict.' }, { status: 409 });
  }

  if (head?.object_key && head.object_key !== objectKey) {
    try {
      await env.VAULT_BUCKET.delete(head.object_key);
    } catch {
      // The new head is already committed. A stale encrypted object is safer to retain than rolling back.
    }
  }

  return json({ revision: nextRevision });
}
