
self.addEventListener('push', event => {
  let data = {
    title: 'Trackler Reminder',
    body: 'You have a reminder.'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: {
        url: data.url || './index.html'
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification.data?.url || './index.html';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }

      return clients.openWindow(url);
    })
  );
});
