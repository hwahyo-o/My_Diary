import { fromBase64Url } from './cloud-sync.js';

/** Check all resources before exposing authentication flow to a misconfigured Preview. */
export function hasCloudEnvironmentBindings(env) {
  if (!env || typeof env.DB?.prepare !== 'function' ||
      typeof env.VAULT_BUCKET?.get !== 'function' ||
      typeof env.VAULT_BUCKET?.put !== 'function' ||
      typeof env.VAULT_BUCKET?.delete !== 'function') return false;

  for (const value of [env.AUTH_PEPPER, env.UNLOCK_MASTER_KEY]) {
    if (typeof value !== 'string') return false;
    let bytes;
    try {
      bytes = fromBase64Url(value);
      if (bytes.length !== 32) return false;
    } catch {
      return false;
    } finally {
      bytes?.fill(0);
    }
  }
  return true;
}
