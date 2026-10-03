// Custom service-worker code, bundled by @ducanh2912/next-pwa into the
// generated worker. Shows "plan's ready" and "rest's up" pushes and opens the
// app on tap.

self.addEventListener("push", (event) => {
  let data = { title: "Olympus", body: "", url: "/today", tag: "liftlog-plan" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    (async () => {
      // A rest push is only for a backgrounded app: if a window is on screen,
      // the in-app timer already ticked.
      if (data.tag === "olympus-rest") {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (wins.some((w) => w.visibilityState === "visible")) return;
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        tag: data.tag,
        renotify: true,
        vibrate: data.tag === "olympus-rest" ? [30, 40, 30] : undefined,
        data: { url: data.url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
