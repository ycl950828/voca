// 오프라인 실행용 서비스 워커: 앱 파일을 기기에 저장해 두고 인터넷 없이도 열리게 함
const CACHE = 'toeic-voca-v1';
const FILES = ["./", "apple-touch-icon.png", "eng.traineddata.gz", "icon-192.png", "icon-512.png", "index.html", "kor.traineddata.gz", "manifest.webmanifest", "tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract.min.js", "worker.min.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match('./'))));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // 글꼴은 처음 받을 때 저장해 두고 이후 오프라인에서도 사용
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit))));
  }
});
