import { useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Smart back navigation for SPA.
 * Only uses window.history.back() when the previous page is from the same
 * origin (i.e. we navigated within the app). Otherwise falls back to the
 * provided route — prevents the blank/black screen when the user arrived
 * directly via a fresh tab, shared link, or external referrer.
 */
export function useGoBack(fallback = "/dashboard") {
  const [, setLocation] = useLocation();
  return useCallback(() => {
    try {
      const isSameOrigin =
        !!document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
      if (isSameOrigin) {
        window.history.back();
        return;
      }
    } catch {
      /* URL parse error — fall through to setLocation */
    }
    setLocation(fallback);
  }, [fallback, setLocation]);
}
