import type {
  CloudAccountChallenge,
  CloudAccountDeleteResult,
  CloudLoginInput,
  CloudLoginResult,
  CloudSnapshotDownload,
  CloudSnapshotUploadInput,
  CloudSnapshotUploadResult,
  CloudSyncHead,
} from './types';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Cloud sync request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export class CloudSyncClient {
  constructor(private readonly baseUrl = '') {}

  async challenge(nickname: string): Promise<CloudAccountChallenge> {
    const response = await fetch(`${this.baseUrl}/api/account/challenge`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname }),
    });
    return parseJson<CloudAccountChallenge>(response);
  }

  async register(input: {
    readonly nickname: string;
    readonly accountSalt: Uint8Array;
    readonly authSecret: Uint8Array;
  }): Promise<CloudLoginResult> {
    const response = await fetch(`${this.baseUrl}/api/account/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nickname: input.nickname,
        accountSalt: base64Url(input.accountSalt),
        authSecret: base64Url(input.authSecret),
      }),
    });
    return parseJson<CloudLoginResult>(response);
  }

  async login(input: CloudLoginInput): Promise<CloudLoginResult> {
    const response = await fetch(`${this.baseUrl}/api/account/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson<CloudLoginResult>(response);
  }

  async loginWithSecret(nickname: string, authSecret: Uint8Array): Promise<CloudLoginResult> {
    return this.login({ nickname, authSecret: base64Url(authSecret) });
  }

  async deleteAccount(authSecret: Uint8Array): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/account/delete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authSecret: base64Url(authSecret) }),
    });
    const result = await parseJson<CloudAccountDeleteResult>(response);
    if (!result.ok) throw new Error('Cloud account reset failed.');
  }

  async logout(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/account/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    await parseJson<{ ok: boolean }>(response);
  }

  async getHead(): Promise<CloudSyncHead> {
    const response = await fetch(`${this.baseUrl}/api/sync/head`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return parseJson<CloudSyncHead>(response);
  }

  async downloadSnapshot(): Promise<CloudSnapshotDownload | null> {
    const response = await fetch(`${this.baseUrl}/api/sync/download`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 204) return null;
    if (!response.ok) await parseJson<never>(response);

    const revision = Number(response.headers.get('x-my-diary-revision'));
    const objectSha256 = response.headers.get('x-my-diary-sha256');
    if (!Number.isSafeInteger(revision) || revision <= 0 || !objectSha256) {
      throw new Error('Cloud snapshot metadata is invalid.');
    }
    return {
      revision,
      objectSha256,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  async uploadSnapshot(input: CloudSnapshotUploadInput): Promise<CloudSnapshotUploadResult> {
    const response = await fetch(`${this.baseUrl}/api/sync/upload`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'content-type': 'application/octet-stream',
        'x-my-diary-expected-revision': String(input.expectedRevision),
        'x-my-diary-sha256': input.objectSha256,
      },
      body: input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer,
    });
    return parseJson<CloudSnapshotUploadResult>(response);
  }

  static decodeBytes(value: string): Uint8Array {
    return decodeBase64Url(value);
  }
}
