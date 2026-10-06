export type CacheDisposition = 'bypass' | 'navigation' | 'static';

const SENSITIVE_PATH_PREFIXES = [
  '/api/',
  '/runtime/',
  '/finance/',
  '/vault/',
  '/backup/',
  '/import/',
  '/export/',
];

const SAFE_STATIC_EXTENSIONS = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|json|webmanifest)$/i;

export function classifyRequestForCache(request: Request, appOrigin: string): CacheDisposition {
  if (request.method !== 'GET') return 'bypass';

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return 'bypass';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'bypass';
  if (url.origin !== appOrigin) return 'bypass';
  if (url.pathname.toLowerCase().endsWith('.vault')) return 'bypass';
  if (SENSITIVE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return 'bypass';

  if (request.mode === 'navigate' || request.destination === 'document') return 'navigation';
  if (SAFE_STATIC_EXTENSIONS.test(url.pathname)) return 'static';

  return 'bypass';
}
