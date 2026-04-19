// SafeReport Service Worker
//
// Minimal SW whose only job is handling web push. No caching, no
// offline — we want managers to always talk to the live server, so
// turning this into a full PWA is out of scope for the pilot.
//
// Keep this file plain JS (not TS) so it can be served directly from
// /public without a build step.

self.addEventListener("install", (event) => {
  // Activate immediately on first install. No caches to warm up.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Take control of any already-open tabs so we don't need a page
  // reload before pushes start landing.
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  // Defensive: a push with no data should still show SOMETHING so
  // the manager knows there's activity on the store.
  let payload = {
    title: "SafeReport",
    body: "A new event needs your attention.",
    url: "/",
  }
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      // Non-JSON payload — fall through with the default above.
      const text = event.data.text()
      if (text) payload.body = text
    }
  }

  const title = payload.title || "SafeReport"
  const options = {
    body: payload.body,
    // An inline SVG-ish icon would be nice; for the pilot any 192px
    // square works. We ship the favicon as a safe fallback.
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    // `data.url` is what the `notificationclick` handler uses.
    data: { url: payload.url || "/" },
    // Tag collapses duplicate pushes (e.g. a noisy store getting
    // several reports back-to-back) into a single notification bell.
    tag: payload.tag || "safereport",
    // Renotify = true lets the device buzz again when a new push
    // overwrites an existing notification with the same tag.
    renotify: true,
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"

  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      // If we already have a SafeReport tab open, focus it and hop to
      // the target URL. Otherwise open a new one.
      for (const client of clientsArr) {
        try {
          const clientUrl = new URL(client.url)
          if (clientUrl.origin === self.location.origin) {
            await client.focus()
            if ("navigate" in client) {
              try {
                await client.navigate(url)
              } catch {
                /* same-origin navigate can fail on older browsers — ignore */
              }
            }
            return
          }
        } catch {
          /* ignore malformed client.url */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
