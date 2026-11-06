import { expect, it } from 'vitest';
import { onRequestPost } from '../../functions/api/account/register.js';

it('fails closed without registering accounts when cloud environment bindings or secrets are missing', async () => {
  const request = new Request('https://preview.example.test/api/account/register', {
    method: 'POST',
    headers: { origin: 'https://preview.example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'test-preview-only' }),
  });
  // Preview deliberately has no Production D1, R2 or secret access.
  const response = await onRequestPost({ request, env: {} });
  expect(response.status).toBe(503);
  const result = await response.json() as { error: string };
  expect(result.error).toContain('not configured');
  expect(JSON.stringify(result)).not.toContain('AUTH_PEPPER');
  expect(JSON.stringify(result)).not.toContain('UNLOCK_MASTER_KEY');
});
