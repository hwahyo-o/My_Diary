import { describe, expect, it } from 'vitest';
import { CloudSyncHttpError } from '../../cloud-sync/http-client';
import { describeCloudLoginError } from './cloud-login-error';
// @ts-expect-error JavaScript Pages functions do not have TypeScript declarations.
import { onRequestPost as challenge } from '../../../functions/api/account/challenge.js';
// @ts-expect-error JavaScript Pages functions do not have TypeScript declarations.
import { onRequestPost as login } from '../../../functions/api/account/login.js';
// @ts-expect-error JavaScript Pages functions do not have TypeScript declarations.
import { onRequestPost as register } from '../../../functions/api/account/register.js';

const origin = 'https://preview.example.test';
const request = (path: string) => new Request(origin + path, {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ nickname: 'preview-only' }),
});

describe('unconfigured Preview cloud authentication', () => {
  it.each([
    ['/api/account/challenge', challenge],
    ['/api/account/login', login],
    ['/api/account/register', register],
  ])('%s returns HTTP 503 rather than a misleading invalid PIN', async (path, handler) => {
    const response = await handler({ request: request(path), env: {} });
    expect(response.status).toBe(503);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/not configured/i);
    expect(JSON.stringify(body)).not.toContain('AUTH_PEPPER');
  });

  it('maps HTTP 503 to server configuration rather than incorrect credentials', () => {
    const message = describeCloudLoginError(new CloudSyncHttpError('not configured', 503));
    expect(message).toContain('서버');
    expect(message).toContain('PIN이 틀렸다고 단정할 수 없습니다');
  });

  it('still explains a genuine invalid-credentials response without leaking details', () => {
    const message = describeCloudLoginError(new CloudSyncHttpError('wrong auth', 401));
    expect(message).toContain('닉네임 또는 PIN');
    expect(message).not.toContain('wrong auth');
  });
});
