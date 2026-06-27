import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Register Service Worker with update prompt support
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Handled by PWAUpdateBanner via useRegisterSW hook
  },
  onOfflineReady() {
    // Handled by PWAUpdateBanner via useRegisterSW hook
  },
  onRegisterError(error) {
    console.error("[SW] Registration failed:", error);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
