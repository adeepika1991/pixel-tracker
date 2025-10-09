(() => {
  // --- Config ---
  const DEBUG = false;
  const ANALYTICS_URL = "https://analytics-backend-97k7.onrender.com/track";
  const BATCH_INTERVAL = 5000; // 5s batching window
  const HEARTBEAT_INTERVAL = 15000; // session alive ping every 15s

  // --- Session ---
  const sessionId = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}`;
  const startTime = Date.now();

  // --- Internal state ---
  const eventQueue = [];
  let locationCache = null;
  let heartbeatTimer = null;
  let batchTimer = null;

  // --- Utilities ---
  const log = (...args) => DEBUG && console.log("[Pixel]", ...args);

  const enqueueEvent = (type, data = {}) => {
    const event = {
      type,
      data,
      url: window.location.href,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      sessionId,
      userAgent: navigator.userAgent,
    };
    eventQueue.push(event);
    log(`Enqueued event: ${type}`);
  };

  const flushEvents = async () => {
    if (!eventQueue.length) return;
    const payload = eventQueue.splice(0, eventQueue.length);
    log(`Flushing ${payload.length} events`);

    if (DEBUG) {
      console.table(payload);
      return;
    }

    try {
      const response = await fetch(ANALYTICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: payload }),
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      log(`Successfully sent ${payload.length} events`);
    } catch (err) {
      console.warn("Pixel flush failed:", err);
      // push events back if failed
      eventQueue.unshift(...payload);
    }
  };

  // --- Location (cached) ---
  const getLocation = async () => {
    if (locationCache) return locationCache;
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch("https://ipapi.co/json/", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      locationCache = {
        country: data.country_name || "Unknown",
        city: data.city || "Unknown",
        ip: data.ip || "Hidden",
      };
    } catch (err) {
      console.warn("Location detection failed:", err);
      locationCache = { country: "Unknown", city: "Unknown" };
    }
    return locationCache;
  };

  // --- Trackers ---
  const trackVisit = async () => {
    try {
      const loc = await getLocation();
      enqueueEvent("visit", { ...loc });
      log(`Visit detected from ${loc.city}, ${loc.country}`);
    } catch (err) {
      // Still track visit even if location fails
      enqueueEvent("visit", { country: "Unknown", city: "Unknown" });
      log(`Visit detected (location failed)`);
    }
  };

  const trackClicks = () => {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-track]");
      if (target) {
        const label = target.getAttribute("data-track");
        enqueueEvent("click", { label });
        log(`Clicked on ${label}`);
      }
    });
  };

  const trackTimeSpent = () => {
    window.addEventListener("beforeunload", () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      enqueueEvent("time_spent", { duration });
      // Force immediate flush on page unload
      fetch(ANALYTICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch: [
            {
              type: "time_spent",
              data: { duration },
              url: window.location.href,
              referrer: document.referrer,
              timestamp: new Date().toISOString(),
              sessionId,
              userAgent: navigator.userAgent,
            },
          ],
        }),
        keepalive: true,
      }).catch(console.warn);
      log(`User spent ${duration}s`);
    });
  };

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      enqueueEvent("heartbeat", { uptime: Date.now() - startTime });
      flushEvents();
    }, HEARTBEAT_INTERVAL);
  };

  // --- Batching Loop ---
  const startBatching = () => {
    batchTimer = setInterval(flushEvents, BATCH_INTERVAL);
  };

  // --- Bootstrap ---
  (() => {
    // Start all trackers immediately without waiting
    trackVisit(); // Don't await - let it run in background
    trackClicks();
    trackTimeSpent();
    startHeartbeat();
    startBatching();
    log("Pixel initialized ✅");

    // Expose for debugging
    window.pixelDebug = {
      eventQueue,
      flushEvents,
      sessionId,
    };
  })();
})();
