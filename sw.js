// 마크다운 뷰어 서비스 워커
// - 정적 자산 오프라인 캐싱
// - Web Share Target 처리 (다른 앱에서 .md 파일/텍스트를 "공유"로 받기)
//
// 캐시 전략 메모:
// 앱 자체 코드(HTML/CSS/JS)는 네트워크 우선(network-first)으로 가져온다.
// 캐시 우선(cache-first)으로 두면 배포를 갱신해도 새로고침이 계속
// 예전 버전만 보여주는 문제가 생기기 때문이다. 자주 안 바뀌는
// 외부 라이브러리/아이콘/매니페스트만 캐시 우선으로 둔다.
const CACHE_VERSION = 'md-viewer-v2';
const SHARE_CACHE = 'md-viewer-share-v1';
const SHARE_KEY = 'shared-payload';

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

// 배포마다 바뀌는 앱 자체 코드 → network-first
const NETWORK_FIRST = new Set(['./', './index.html', './css/style.css', './js/app.js']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // 개별 자산 캐싱 실패가 전체 설치를 막지 않도록 개별 처리
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== SHARE_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Web Share Target: 다른 앱에서 "공유하기"로 전달된 요청 처리
  if (request.method === 'POST' && url.pathname.endsWith('/share-target/')) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // 그 외에는 동일 출처 GET 요청만 처리
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const path = './' + url.pathname.replace(/^\//, '').replace(/^boyeo\//, '');
  const isAppShell = request.mode === 'navigate' || NETWORK_FIRST.has(path);

  event.respondWith(isAppShell ? networkFirst(request) : cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await caches.match('./index.html');
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('./index.html');
    if (fallback) return fallback;
    throw err;
  }
}

async function handleShareTarget(event) {
  const request = event.request;
  let content = '';
  let filename = '';

  try {
    const formData = await request.formData();
    const file = formData.get('mdfile');
    const text = formData.get('text');
    const sharedUrl = formData.get('url');
    const title = formData.get('title');

    if (file && typeof file.text === 'function' && file.size > 0) {
      content = await file.text();
      filename = file.name || '';
    } else if (text) {
      content = text;
    } else if (sharedUrl) {
      content = sharedUrl;
    } else if (title) {
      content = title;
    }
  } catch (err) {
    content = '';
  }

  const cache = await caches.open(SHARE_CACHE);
  await cache.put(
    SHARE_KEY,
    new Response(JSON.stringify({ content, filename }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );

  // action("share-target/")은 scope 바로 한 단계 아래이므로
  // 상위 경로(앱 루트)로 리다이렉트한다.
  return Response.redirect(new URL('../?shared=1', request.url).toString(), 303);
}
