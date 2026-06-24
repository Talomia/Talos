/*! Cross-Origin Isolation Service Worker */
/*
 * Intercepts all fetch requests and injects COOP/COEP headers so that
 * SharedArrayBuffer is available even when the reverse proxy strips headers.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  event.respondWith(
    fetch(request.mode === 'no-cors' ? new Request(request, { credentials: 'omit' }) : request)
      .then((response) => {
        if (response.status === 0) {
          return response;
        }

        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch((error) => {
        console.error('[COI-SW] Fetch interceptor error:', error);
        return fetch(request);
      })
  );
});
