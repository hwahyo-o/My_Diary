import { describe, expect, it } from 'vitest';
import { classifyRequestForCache } from './cache-policy';

function request(url: string, method = 'GET', mode: RequestMode = 'cors', destination: RequestDestination = ''): Request {
  return { url, method, mode, destination } as Request;
}

describe('PWA cache security policy', () => {
  it('bypasses vault, mutation, cross-origin, blob/data, and finance runtime traffic', () => {
    const origin = 'https://diary.example';
    expect(classifyRequestForCache(request(`${origin}/backup.vault`), origin)).toBe('bypass');
    expect(classifyRequestForCache(request(`${origin}/api/transactions`), origin)).toBe('bypass');
    expect(classifyRequestForCache(request(`${origin}/runtime/reports/month-end`), origin)).toBe('bypass');
    expect(classifyRequestForCache(request(`${origin}/assets/app.js`, 'POST'), origin)).toBe('bypass');
    expect(classifyRequestForCache(request('https://cdn.example/app.js'), origin)).toBe('bypass');
    expect(classifyRequestForCache(request('blob:https://diary.example/example'), origin)).toBe('bypass');
    expect(classifyRequestForCache(request('data:text/plain,hello'), origin)).toBe('bypass');
  });

  it('uses navigation fallback for documents and safe static caching for app assets', () => {
    const origin = 'https://diary.example';
    expect(classifyRequestForCache(request(`${origin}/settings`, 'GET', 'navigate'), origin)).toBe('navigation');
    expect(classifyRequestForCache(request(`${origin}/dashboard`, 'GET', 'cors', 'document'), origin)).toBe('navigation');
    expect(classifyRequestForCache(request(`${origin}/assets/app.js`), origin)).toBe('static');
    expect(classifyRequestForCache(request(`${origin}/assets/app.css`), origin)).toBe('static');
    expect(classifyRequestForCache(request(`${origin}/icons/icon-192.png`), origin)).toBe('static');
  });
});
