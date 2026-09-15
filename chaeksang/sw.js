// 책상 서비스워커
//
// 곳간 `PWA_셸/sw.js`·SalesON `saleson/sw.js`와 같은 전략을 그대로 가져온다.
// 네트워크 우선(no-store)인 이유: fetch 핸들러를 비워 두면 "캐시 안 함"이 아니라
// 브라우저 기본 캐시에 맡기는 것이 되어, 배포해도 낡은 화면이 계속 보일 수 있다
// (곳간이 2026-08-06에 이 함정을 겪었다). 책상은 시트를 직접 fetch로 부르는 화면이라
// 낡은 화면이 조용한 오류(옛 API 경로 등)를 만들 위험이 같다.
const CACHE = 'chaeksang-app-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 화면(문서)만 다룬다. 아이콘·manifest는 자주 안 바뀌고 기본 동작으로 충분하다.
  if (req.mode !== 'navigate' && req.destination !== 'document') return;

  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }))
      .then(function (res) {
        // 오프라인 대비 사본
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req.url, copy); }).catch(function () {});
        return res;
      })
      .catch(function () {
        return caches.match(req.url).then(function (m) { return m || Response.error(); });
      })
  );
});
