(() => {
  // --- Local Debug Mode ---
  const DEBUG = true;
  const ANALYTICS_URL = "https://analytics.deepikaads.com/track"; // 👈 your backend endpoint

  // Create a unique session ID
  const sessionId = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}`;

  // Utility: send event to backend
  const sendEvent = async (type, data = {}) => {
    if (DEBUG) {
      console.log(`[Pixel Debug] ${type.toUpperCase()} event:`, data);
      return;
    }
    try {
      await fetch(ANALYTICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          data,
          url: window.location.href,
          referrer: document.referrer,
          timestamp: new Date().toISOString(),
          sessionId,
          userAgent: navigator.userAgent,
        }),
      });
    } catch (err) {
      console.warn("Pixel send failed:", err);
    }
  };

  // 1️⃣ Track Page Visit + Location
  const trackVisit = async () => {
    try {
      const ipRes = await fetch("https://ipapi.co/json/"); // free IP geo service
      const ipData = await ipRes.json();
      const country = ipData.country_name || "Unknown";

      await sendEvent("visit", { country });
      console.log(`Pixel: Someone from ${country} has visited your site.`);
    } catch (e) {
      await sendEvent("visit", { country: "Unknown" });
    }
  };

  // 2️⃣ Track Clicks
  const trackClicks = () => {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-track]");
      if (target) {
        const label = target.getAttribute("data-track");
        sendEvent("click", { label });
        console.log(`Pixel: Clicked on ${label}`);
      }
    });
  };

  // 3️⃣ Track Time Spent
  let startTime = Date.now();
  window.addEventListener("beforeunload", () => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    sendEvent("time_spent", { duration });
    console.log(`Pixel: User spent ${duration}s on this page.`);
  });

  // Bootstrap tracking
  trackVisit();
  trackClicks();
})();
