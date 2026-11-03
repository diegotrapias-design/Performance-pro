self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Performance Pro', {
    body: data.body || 'Um atleta finalizou um treino.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/' },
    tag: 'performance-pro-workout-finished',
    renotify: true
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.focus();
    return clients.openWindow(target);
  }));
});