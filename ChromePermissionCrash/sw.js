self.addEventListener('activate', (event) => {
    console.log('activate');
    console.log(event);
});

self.addEventListener('fetch', (event) => {
    console.log('Got a request in SW:', event.request);

    if (event.request.url.endsWith('/test/')) {
        event.respondWith(
            new Response('Text from service worker', {headers: { 'Content-Type': 'text/plain' }})
        );
    }
});


self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'get-latest-text') {
      console.log('got get-latest-text');
    }
});