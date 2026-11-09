// 오프라인 실행용 서비스 워커: 앱 파일을 기기에 저장해 두고 인터넷 없이도 열리게 함
const CACHE = 'toeic-voca-v16';
// 설치할 때 바로 받는 앱 기본 파일 (작음)
const CORE = ["./", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "index.html", "manifest.webmanifest", "tesseract.min.js"];
// 기기 안 인식 엔진 (약 12MB): 설치를 막지 않도록 나중에 따로 받아 둠
const OCR_FILES = ["worker.min.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js", "kor.traineddata.gz", "eng.traineddata.gz"];
const isOcr = (pathname) => OCR_FILES.some((f) => pathname.endsWith('/' + f));

// 아직 저장 안 된 인식 엔진 파일만 받아 둠 (예전 버전에 저장된 파일이 있으면 그걸 옮겨 씀)
async function warmOcr() {
  const c = await caches.open(CACHE);
  for (const f of OCR_FILES) {
    if (await c.match(f)) continue;
    const old = await caches.match(f);   // 이전 버전 캐시
    if (old) { await c.put(f, old); continue; }
    try { const res = await fetch(f); if (res.ok) await c.put(f, res); } catch (e) {}
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 지우기 전에 예전 캐시에 있던 인식 엔진 파일을 새 캐시로 옮김 (다시 받지 않게)
    const c = await caches.open(CACHE);
    for (const f of OCR_FILES) { if (!(await c.match(f))) { const old = await caches.match(f); if (old) await c.put(f, old); } }
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
// 앱 화면이 준비되면 "warm-ocr" 메시지를 보냄 → 인식 엔진을 뒤에서 받아 둠 (오프라인 인식용)
self.addEventListener('message', (e) => { if (e.data === 'warm-ocr') e.waitUntil(warmOcr()); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname))) {
    // 앱 화면(index.html)은 인터넷이 되면 최신 버전을, 안 되면(3초 초과) 저장된 버전을 사용
    e.respondWith(caches.open(CACHE).then((c) => new Promise((resolve) => {
      let done = false;
      const fallback = () => c.match('./').then((hit) => { if (!done && hit) { done = true; resolve(hit); } });
      const timer = setTimeout(fallback, 3000);
      fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then((res) => {   // 화면 요청은 주소로 새로 만들어 보냄
        if (res.ok) c.put('./', res.clone());
        clearTimeout(timer); if (!done) { done = true; resolve(res); }
      }).catch(() => { clearTimeout(timer); c.match('./').then((hit) => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
    })));
  } else if (url.origin === location.origin && isOcr(url.pathname)) {
    // 인식 엔진: 저장된 게 있으면 사용, 없으면 받아서 저장
    e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) c.put(url.origin + url.pathname, res.clone());
      return res;
    }))));
  } else if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // 글꼴은 처음 받을 때 저장해 두고 이후 오프라인에서도 사용
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit))));
  }
});
