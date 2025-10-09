(() => {
  // --- Config ---
  const DEBUG = false;
  const ANALYTICS_URL = "https://analytics-backend-97k7.onrender.com/track";
  const BATCH_INTERVAL = 5000;
  const HEARTBEAT_INTERVAL = 30000; // Reduced from 15s to 30s to reduce noise

  // --- Session ---
  const sessionId = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  const startTime = Date.now();
  let pageViewSent = false;

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
    log(`Enqueued event: ${type}`, data);
  };

  const flushEvents = async () => {
    if (!eventQueue.length) return;
    const payload = eventQueue.splice(0, eventQueue.length);

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

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      log(`Sent ${payload.length} events`);
    } catch (err) {
      console.warn("Pixel flush failed:", err);
      eventQueue.unshift(...payload);
    }
  };

  // --- Location ---
  const getLocation = async () => {
    if (locationCache) return locationCache;
    try {
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
        region: data.region || "Unknown",
        ip: data.ip ? data.ip.substring(0, 8) + "..." : "Hidden",
      };
    } catch (err) {
      locationCache = {
        country: "Unknown",
        city: "Unknown",
        region: "Unknown",
      };
    }
    return locationCache;
  };

  // --- Trackers ---
  const trackPageView = async () => {
    if (pageViewSent) return;

    try {
      const loc = await getLocation();
      enqueueEvent("visit", {
        ...loc,
        page_title: document.title,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      });
      pageViewSent = true;
      log(`Page view from ${loc.city}, ${loc.country}`);
    } catch (err) {
      enqueueEvent("visit", {
        country: "Unknown",
        city: "Unknown",
        page_title: document.title,
      });
    }
  };

  const trackClicks = () => {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-track]");
      if (target) {
        const label = target.getAttribute("data-track");
        const elementType = target.tagName.toLowerCase();

        enqueueEvent("click", {
          label,
          element_type: elementType,
          element_text: target.textContent?.trim().substring(0, 50) || "",
        });
        log(`Clicked: ${label} (${elementType})`);
      }
    });
  };

  const trackEngagement = () => {
    let scrollDepth = 0;

    window.addEventListener(
      "scroll",
      () => {
        const newDepth = Math.round(
          (window.scrollY /
            (document.documentElement.scrollHeight - window.innerHeight)) *
            100
        );
        if (newDepth > scrollDepth) {
          scrollDepth = newDepth;
          // Only track major scroll milestones
          if ([25, 50, 75, 90, 100].includes(scrollDepth)) {
            enqueueEvent("scroll", { depth: scrollDepth });
          }
        }
      },
      { passive: true }
    );
  };

  const trackTimeSpent = () => {
    window.addEventListener("beforeunload", () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      enqueueEvent("session_end", {
        duration,
        final_url: window.location.href,
      });

      // Final flush
      if (navigator.sendBeacon) {
        const data = JSON.stringify({
          batch: [
            {
              type: "session_end",
              data: { duration },
              url: window.location.href,
              timestamp: new Date().toISOString(),
              sessionId,
            },
          ],
        });
        navigator.sendBeacon(ANALYTICS_URL, data);
      }
    });
  };

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      enqueueEvent("heartbeat", {
        uptime: Date.now() - startTime,
        active_time: Math.round((Date.now() - startTime) / 1000),
      });
      flushEvents();
    }, HEARTBEAT_INTERVAL);
  };

  // --- Batching ---
  const startBatching = () => {
    setInterval(flushEvents, BATCH_INTERVAL);
  };

  // --- Bootstrap ---
  (() => {
    trackPageView();
    trackClicks();
    trackEngagement();
    trackTimeSpent();
    startHeartbeat();
    startBatching();
    log("Pixel initialized ✅");

    // Debug exposure
    if (DEBUG) {
      window.pixelDebug = { eventQueue, flushEvents, sessionId };
    }
  })();
})();
