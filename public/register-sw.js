// Register service worker only in production and if browser supports it
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
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