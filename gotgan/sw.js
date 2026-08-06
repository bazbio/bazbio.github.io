// 곳간 서비스워커
//
// SalesON `saleson/sw.js`와 같은 전략이다. 그쪽이 2026-08-01에 값을 치르고 얻은 교훈을
// 곳간은 2026-08-06에 뒤늦게 따라간다.
//
// 왜 네트워크 우선(no-store)인가:
//   예전에는 fetch 핸들러가 비어 있었다("앱 데이터는 캐시하지 않음"). 그런데 그건 캐시를
//   안 하는 게 아니라 **브라우저 기본 캐시에 통째로 맡기는 것**이었다. 그래서 파비콘 링크를
//   고쳐 배포해도 브라우저가 낡은 index.html을 계속 써서 탭 아이콘이 지구본으로 남았다
//   (2026-08-06 확인 — 두 번 배포하고도 안 바뀌어 여기까지 왔다).
//
//   같은 함정이 화면·API에도 걸린다. 지금은 부트 관문·저장 경로를 계속 바꾸는 시기라
//   낡은 화면이 조용한 오류를 만든다. 재실행마다 +0.15~0.3초를 내고 **낡은 화면이 안 붙는
//   것**을 산다.
const CACHE = 'gotgan-app-v1';

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
