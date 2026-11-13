// Next's lazyOnload strategy can run this script after the load event.
if (
  'serviceWorker' in navigator &&
  !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) &&
  window.self === window.top &&
  !window.ReactNativeWebView
) {
  function registerServiceWorker() {
    navigator.serviceWorker.register('/sw.js').catch(function (error) {
      console.error('Service worker registration failed', error);
    });
  }

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }
}
