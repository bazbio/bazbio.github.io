// SalesON 서비스워커 (ADR 0008)
//
// 예전 셸의 sw.js를 그대로 이어받는다. 다른 점은 캐시 대상이 6.5KB 셸이 아니라
// 196KB 앱 전체라는 것뿐이다 — 전략은 바꾸지 않는다.
//
// 왜 네트워크 우선(no-store)인가:
//   예전에는 fetch 핸들러가 비어 있었다("캐시하지 않음"). 그런데 그건 캐시를 안 하는 게
//   아니라 브라우저 기본 캐시에 통째로 맡기는 것이었고, iOS 홈 화면 앱은 시작 페이지를
//   오래 붙든다. 그래서 기기 ID(@107)와 로그인 토큰(@110)을 옮긴 변경이 폰에 도착조차
//   못 했다 — 폰은 계속 낡은 화면을 실행했고 인증번호가 반복됐다 (2026-08-01 확인).
//
//   재실행마다 +0.15~0.3초를 내고 **낡은 화면이 안 붙는 것**을 산다. GAS가 내려주던
//   2.2초를 0.25초로 줄이는 마당에, 그걸 0.05초로 더 줄이자고 최대 10분 낡은 화면을
//   감수할 이유가 없다. 지금은 서버 API를 계속 바꾸는 시기라 낡은 화면이 조용한 오류를 만든다.
//
// 더 빠르게 만드는 정공법(파일을 쪼개고 이름에 해시를 붙여 캐시 우선)은 단일 파일 구조를
// 뜯는 별도 작업이다 — ADR 0008에 남겨 두었다.
const CACHE = 'saleson-app-v1';

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
        // 오프라인 대비 사본 — 예전에는 사본이 없어 비행기 모드에서 흰 화면이었다
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req.url, copy); }).catch(function () {});
        return res;
      })
      .catch(function () {
        return caches.match(req.url).then(function (m) { return m || Response.error(); });
      })
  );
});
