// 마크다운 뷰어 서비스 워커
// - 정적 자산 오프라인 캐싱
// - Web Share Target 처리 (다른 앱에서 .md 파일/텍스트를 "공유"로 받기)

const CACHE_VERSION = 'md-viewer-v1';
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

  // 그 외에는 동일 출처 GET 요청만 캐시 우선 전략으로 처리
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
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
    })()
  );
});

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
