/**
 * PWA Detection — returns true only when Simix is running as an installed PWA.
 * Never returns true in a regular browser tab.
 */
export function isPWA(): boolean {
  if (typeof window === "undefined") return false;

  // iOS Safari: window.navigator.standalone === true when launched from home screen
  if ((window.navigator as any).standalone === true) return true;

  // CSS display-mode media queries (Chrome, Edge, Samsung Internet, Firefox)
  const modes = ["standalone", "fullscreen", "minimal-ui"] as const;
  for (const mode of modes) {
    try {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) return true;
    } catch {
      // matchMedia may throw in unusual environments
    }
  }

  return false;
}

/** Subscribe to PWA mode changes (e.g. user installs the app while it's open) */
export function onPWAChange(callback: (isPwa: boolean) => void): () => void {
  const queries = ["standalone", "fullscreen", "minimal-ui"].map((mode) =>
    window.matchMedia(`(display-mode: ${mode})`),
  );

  const handler = () => callback(isPWA());
  queries.forEach((mq) => mq.addEventListener("change", handler));
  return () => queries.forEach((mq) => mq.removeEventListener("change", handler));
}
