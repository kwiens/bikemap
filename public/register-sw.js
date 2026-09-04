// Register service worker only in production, if browser supports it, and if not inside a frame
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost' && window.self === window.top) {
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