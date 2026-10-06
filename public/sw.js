/* global self, caches, fetch, Response, URL */
const RELEASE_ID = '2026.10.06.1';
const CACHE_PREFIX = 'my-diary-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const BASE_PATH = new URL('./', self.location.href).pathname;
const INDEX_URL = new URL('index.html', self.location.href).pathname;
const APP_SHELL = [BASE_PATH, INDEX_URL];
const SAFE_STATIC_EXTENSION = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|json|webmanifest)$/i;
const SENSITIVE_PATH_PREFIXES = ['/api/', '/runtime/', '/finance/', '/vault/', '/backup/', '/import/', '/export/'];

function scopedPathname(pathname) {
  if (!pathname.startsWith(BASE_PATH)) return null;
  return `/${pathname.slice(BASE_PATH.length)}`;
}

function classifyRequest(request) {
  if (request.method !== 'GET') return 'bypass';

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return 'bypass';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'bypass';
  if (url.origin !== self.location.origin) return 'bypass';
  const path = scopedPathname(url.pathname);
  if (path === null) return 'bypass';
  if (path.toLowerCase().endsWith('.vault')) return 'bypass';
  if (SENSITIVE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'bypass';
  if (request.mode === 'navigate' || request.destination === 'document') return 'navigation';
  if (SAFE_STATIC_EXTENSION.test(path)) return 'static';
  return 'bypass';
}

async function cacheSafeResponse(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function navigationResponse(request) {
  try {
    const network = await fetch(request);
    await cacheSafeResponse(INDEX_URL, network.clone());
    return network;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || (await cache.match(INDEX_URL)) || Response.error();
  }
}

async function staticResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => cacheSafeResponse(request, response))
    .catch(() => undefined);

  if (cached) {
    void networkPromise;
    return cached;
  }

  return (await networkPromise) || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const disposition = classifyRequest(event.request);
  if (disposition === 'bypass') return;
  if (disposition === 'navigation') {
    event.respondWith(navigationResponse(event.request));
    return;
  }
  event.respondWith(staticResponse(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
