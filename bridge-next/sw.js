// 브리지 서비스워커 (ADR 0008 · PLAN.md 3단계)
//
// 예전에는 fetch 핸들러가 비어 있었다("앱 데이터는 캐시하지 않음"). 그런데 그건 캐시를
// 안 하는 게 아니라 브라우저 기본 캐시에 통째로 맡기는 것이었고, iOS 홈 화면 앱은 시작
// 페이지를 오래 붙든다. 셸이 6.5KB짜리 iframe 껍데기이고 진짜 화면은 GAS가 내려주던
// 동안에는 이것이 무해했다 — 붙들 것이 껍데기뿐이었기 때문이다.
//
// 화면이 Pages로 오면서 사정이 뒤집혔다. 이제 이 파일이 붙드는 것이 **앱 그 자체**다.
// 그대로 뒀다면 배포한 화면이 폰에 도착조차 못 한다. SalesON이 2026-08-01에 정확히 그것으로
// 하루를 날렸다 — 기기 ID와 토큰을 옮긴 변경이 폰에 안 닿아 인증번호가 반복됐다.
//
// 그래서 네트워크 우선(no-store)으로 바꾼다. 재실행마다 +0.15~0.3초를 내고 **낡은 화면이
// 안 붙는 것**을 산다. GAS가 내려주던 1.6초를 0.2초로 줄이는 마당에, 그걸 0.05초로 더
// 줄이자고 낡은 화면을 감수할 이유가 없다. 지금은 서버 API를 계속 바꾸는 시기라 낡은
// 화면이 조용한 오류를 만든다.
//
// 파일을 쪼개고 이름에 해시를 붙여 캐시 우선으로 가는 정공법은 단일 파일 구조를 뜯는
// 별도 작업이다. SalesON도 같은 판단으로 남겨 두었다.
const CACHE = 'bridge-app-v1';

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
        // 오프라인 대비 사본 — 없으면 비행기 모드에서 흰 화면이 된다
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req.url, copy); }).catch(function () {});
        return res;
      })
      .catch(function () {
        return caches.match(req.url).then(function (m) { return m || Response.error(); });
      })
  );
});
