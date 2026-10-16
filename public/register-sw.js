// Register service worker only in production, if browser supports it, if not inside a frame,
// and not inside the native shell (which has no use for an offline web app cache)
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost' && window.self === window.top && !window.__bikemapNative) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(
      function(registration) {
        // Registration was successful
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      },
      function(err) {
        // Registration failed
        console.log('ServiceWorker registration failed: ', err);
      }
    );
  });
} 