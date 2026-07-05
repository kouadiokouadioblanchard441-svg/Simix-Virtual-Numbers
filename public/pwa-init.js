/* PWA install-prompt capture — runs synchronously before React mounts.
 * Stores the beforeinstallprompt event in window.__pwaInstallEvent so that
 * PWAInstallContext can retrieve it without a race condition.               */
(function () {
  window.__pwaInstallEvent = null;
  function capture(e) {
    e.preventDefault();
    window.__pwaInstallEvent = e;
  }
  window.addEventListener("beforeinstallprompt", capture);
})();
