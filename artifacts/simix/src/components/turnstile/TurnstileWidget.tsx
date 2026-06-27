import { useEffect, useRef, useCallback, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "execute" | "interaction-only";
          execution?: "render" | "execute";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      execute: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
}

let scriptLoaded = false;
let scriptLoading = false;
const readyCallbacks: Array<() => void> = [];

function loadTurnstileScript(onReady: () => void): void {
  if (scriptLoaded) {
    onReady();
    return;
  }

  readyCallbacks.push(onReady);

  if (scriptLoading) return;
  scriptLoading = true;

  window.onTurnstileLoad = () => {
    scriptLoaded = true;
    readyCallbacks.forEach((cb) => cb());
    readyCallbacks.length = 0;
  };

  const script = document.createElement("script");
  script.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

let cachedSiteKey: string | null | undefined = undefined;

async function getSiteKey(): Promise<string | null> {
  if (cachedSiteKey !== undefined) return cachedSiteKey;
  try {
    const res = await fetch("/api/config", { credentials: "include" });
    if (!res.ok) {
      cachedSiteKey = null;
      return null;
    }
    const data = await res.json();
    cachedSiteKey = data.turnstileSiteKey ?? null;
    return cachedSiteKey;
  } catch {
    cachedSiteKey = null;
    return null;
  }
}

export function TurnstileWidget({
  onSuccess,
  onExpire,
  onError,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  useEffect(() => {
    getSiteKey().then((key) => {
      if (!key) return;
      setSiteKey(key);
      loadTurnstileScript(() => setReady(true));
    });
  }, []);

  const handleSuccess = useCallback(
    (token: string) => {
      onSuccess(token);
    },
    [onSuccess],
  );

  const handleExpire = useCallback(() => {
    onExpire?.();
  }, [onExpire]);

  const handleError = useCallback(() => {
    onError?.();
  }, [onError]);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile) return;

    if (widgetIdRef.current !== null) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: handleSuccess,
      "expired-callback": handleExpire,
      "error-callback": handleError,
      theme: "dark",
      size: "invisible",
    });

    window.turnstile.execute(widgetIdRef.current);

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [ready, siteKey, handleSuccess, handleExpire, handleError]);

  if (!siteKey) return null;

  return <div ref={containerRef} className={className} />;
}

export function useTurnstileToken() {
  const [token, setToken] = useState("");
  const [expired, setExpired] = useState(false);

  const handleSuccess = useCallback((t: string) => {
    setToken(t);
    setExpired(false);
  }, []);

  const handleExpire = useCallback(() => {
    setToken("");
    setExpired(true);
  }, []);

  const handleError = useCallback(() => {
    setToken("");
  }, []);

  return { token, expired, handleSuccess, handleExpire, handleError };
}
