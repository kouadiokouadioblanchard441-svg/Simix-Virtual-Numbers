import { useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Smart back navigation for SPA.
 * Uses window.history.back() when history exists (normal flow).
 * Falls back to setLocation(fallback) when the user arrived directly
 * (e.g. direct URL, fresh tab) — prevents the blank/black screen issue.
 */
export function useGoBack(fallback = "/dashboard") {
  const [, setLocation] = useLocation();
  return useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation(fallback);
    }
  }, [fallback, setLocation]);
}
