const STORAGE_KEY = "simix_push_subscription";
const PERM_ASKED_KEY = "simix_push_permission_asked";

export type PushPermissionStatus = "default" | "granted" | "denied" | "unsupported";

export function getPushSupport(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export function getPermissionStatus(): PushPermissionStatus {
  if (!getPushSupport()) return "unsupported";
  return Notification.permission as PushPermissionStatus;
}

export function hasAskedPermission(): boolean {
  return sessionStorage.getItem(PERM_ASKED_KEY) === "true";
}

export function markPermissionAsked(): void {
  sessionStorage.setItem(PERM_ASKED_KEY, "true");
}

export async function requestPushPermission(): Promise<PushPermissionStatus> {
  if (!getPushSupport()) return "unsupported";
  markPermissionAsked();
  const result = await Notification.requestPermission();
  return result as PushPermissionStatus;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!getPushSupport()) return null;
  if (Notification.permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(subscription));
  return subscription;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  const result = await subscription.unsubscribe();
  if (result) localStorage.removeItem(STORAGE_KEY);
  return result;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!getPushSupport()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function sendToServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    return res.ok;
  } catch {
    return false;
  }
}
