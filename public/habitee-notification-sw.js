// Handle push notifications from server
self.addEventListener("push", (event) => {
  let data = {
    title: "Daily Activity Check-in",
    body: "Update today's habits and keep your progress current.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "habitee-reminder",
    data: { url: "/" },
  };

  // Parse incoming push data if available
  if (event.data) {
    try {
      data = JSON.parse(event.data.text());
    } catch (error) {
      console.error("Failed to parse push data:", error);
    }
  }

  const { title, ...options } = data;
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });
      const targetUrl = event.notification.data?.url || "/";

      for (const client of windowClients) {
        if ("focus" in client && client.url.includes(self.location.origin)) {
          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

// Handle notification close events
self.addEventListener("notificationclose", (event) => {
  console.log("Notification closed:", event.notification.tag);
});
