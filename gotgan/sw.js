// 곳간 PWA 셸 — 설치 요건 충족용 최소 서비스워커 (앱 데이터는 캐시하지 않음)
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('fetch', function () {});
