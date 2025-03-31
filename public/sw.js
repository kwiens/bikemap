// This is a minimal service worker that makes the app installable
const CACHE_NAME = 'bikemap-v1';

// This empty fetch handler is the minimum required for browsers to consider this a valid service worker
self.addEventListener('fetch', (event) => {
  // We don't actually cache anything here since we don't need offline functionality
  // This is just the minimum to make the app installable
  return;
});

// Install service worker
self.addEventListener('install', (event) => {
  // Skip waiting to ensure the service worker activates immediately
  self.skipWaiting();
});

// Activate service worker
self.addEventListener('activate', (event) => {
  // Claim clients to ensure the service worker controls pages immediately
  event.waitUntil(clients.claim());
}); 