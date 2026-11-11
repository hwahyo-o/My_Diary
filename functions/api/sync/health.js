import { json } from '../../_shared/cloud-sync.js';
import { hasCloudEnvironmentBindings } from '../../_shared/cloud-environment.js';

const REQUIRED_TABLES = Object.freeze(['accounts', 'sessions', 'sync_heads', 'devices']);

/** Read-only, unauthenticated readiness probe. Never exposes secrets or account data. */
export async function onRequestGet({ env }) {
  if (!hasCloudEnvironmentBindings(env)) {
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
