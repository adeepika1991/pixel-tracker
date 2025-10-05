(() => {
  // --- Config ---
  const DEBUG = true;
  const ANALYTICS_URL = "https://analytics.deepikaads.com/track";
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
      await fetch(ANALYTICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: payload }),
        keepalive: true, // important for unload events
      });
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
      const res = await fetch("https://ipapi.co/json/");
      const data = await res.json();
      locationCache = {
        country: data.country_name || "Unknown",
        city: data.city || "Unknown",
        ip: data.ip || "Hidden",
      };
    } catch (err) {
      locationCache = { country: "Unknown", city: "Unknown" };
    }
    return locationCache;
  };

  // --- Trackers ---
  const trackVisit = async () => {
    const loc = await getLocation();
    enqueueEvent("visit", { ...loc });
    log(`Visit detected from ${loc.city}, ${loc.country}`);
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
      flushEvents();
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
  setInterval(flushEvents, BATCH_INTERVAL);

  // --- Bootstrap ---
  (async () => {
    await trackVisit();
    trackClicks();
    trackTimeSpent();
    startHeartbeat();
    log("Pixel initialized ✅");
  })();
})();
