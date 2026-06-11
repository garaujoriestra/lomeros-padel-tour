self.addEventListener('push', function (event) {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icon',
    badge: '/icon',
    data: { url: data.url || '/' },
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.navigate(url).then((c) => (c || client).focus());
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
