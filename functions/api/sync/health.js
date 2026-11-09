import { fromBase64Url, json } from '../../_shared/cloud-sync.js';

const REQUIRED_TABLES = Object.freeze(['accounts', 'sessions', 'sync_heads', 'devices']);

function validSecret(value) {
  if (typeof value !== 'string') return false;
  let bytes;
  try {
    bytes = fromBase64Url(value);
    return bytes.length === 32;
  } catch {
    return false;
  } finally {
    bytes?.fill(0);
  }
}

/** Read-only, unauthenticated readiness probe. Never exposes secrets or account data. */
export async function onRequestGet({ env }) {
  if (!env || typeof env.DB?.prepare !== 'function' ||
      typeof env.VAULT_BUCKET?.get !== 'function' ||
      typeof env.VAULT_BUCKET?.put !== 'function' ||
      typeof env.VAULT_BUCKET?.delete !== 'function' ||
      !validSecret(env.AUTH_PEPPER) || !validSecret(env.UNLOCK_MASTER_KEY)) {
    return json({ ok: false }, { status: 503 });
  }
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('accounts', 'sessions', 'sync_heads', 'devices')",
    ).all();
    const present = new Set((result.results ?? []).map(row => row.name));
    if (!REQUIRED_TABLES.every(table => present.has(table))) {
      return json({ ok: false }, { status: 503 });
    }
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}
