// SalesON PWA 셸 서비스워커
//
// 예전에는 fetch 핸들러가 비어 있었다("캐시하지 않음"). 그런데 그건 캐시를 안 하는 게
// 아니라 브라우저 기본 캐시에 통째로 맡기는 것이었고, iOS 홈 화면 앱은 시작 페이지를
// 오래 붙든다. 그래서 기기 ID(@107)와 로그인 토큰(@110)을 셸로 옮긴 변경이 폰에
// 도착조차 못 했다 — 폰은 계속 낡은 셸을 실행했고 인증번호가 반복됐다 (2026-08-01 확인).
//
// 그래서 셸 HTML만 네트워크 우선으로 받는다. 아이콘·manifest 같은 나머지는 건드리지
// 않는다(자주 안 바뀌고, 기본 동작으로 충분하다).
const CACHE = 'saleson-shell-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode !== 'navigate' && req.destination !== 'document') return;

  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }))
      .then(function (res) {
        // 오프라인 대비 사본을 남긴다 — 예전에는 사본이 없어 비행기 모드에서 흰 화면이었다
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req.url, copy); }).catch(function () {});
        return res;
      })
      .catch(function () {
        return caches.match(req.url).then(function (m) { return m || Response.error(); });
      })
  );
});
