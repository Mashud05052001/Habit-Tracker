/**
 * Notification utilities for enhanced user alerts
 * Includes: Browser notifications, Sound alerts, Toast notifications, and Web Push
 */

export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported"
  | "insecure";

const NOTIFICATION_SW_PATH = "/habitee-notification-sw.js";
const VAPID_PUBLIC_KEY_STORAGE_KEY = "habitee.vapidPublicKey";

type WebPushSendResult = {
  error?: string;
  expired?: boolean;
  sent: boolean;
};

/**
 * Get current notification permission state
 */
export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (!window.isSecureContext) {
    return "insecure";
  }

  return window.Notification.permission;
}

/**
 * Register and return the notification service worker.
 */
export async function getNotificationServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const existingRegistration =
      await navigator.serviceWorker.getRegistration(NOTIFICATION_SW_PATH);

    if (existingRegistration) {
      return existingRegistration;
    }

    const registration =
      await navigator.serviceWorker.register(NOTIFICATION_SW_PATH);
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error("Failed to register notification service worker:", error);
    return null;
  }
}

/**
 * Subscribe to Web Push notifications (works even when tab is closed)
 */
export async function subscribeToPushNotifications(
  publicKey: string,
): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    console.warn("Service Worker not supported");
    return null;
  }

  if (!publicKey) {
    console.error("VAPID public key is missing");
    return null;
  }

  try {
    const registration = await getNotificationServiceWorkerRegistration();

    if (!registration) {
      return null;
    }

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    let storedPublicKey = "";

    try {
      storedPublicKey =
        window.localStorage.getItem(VAPID_PUBLIC_KEY_STORAGE_KEY) || "";
    } catch {
      storedPublicKey = "";
    }

    if (subscription && storedPublicKey && storedPublicKey !== publicKey) {
      await subscription.unsubscribe();
      subscription = null;
    }

    if (!subscription) {
      // Subscribe if not already subscribed
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      console.log("✅ Browser push subscription created");
    }

    // Send both new and existing subscriptions to the server so refreshes
    // or deployments don't leave the server with a missing subscription.
    const response = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    if (!response.ok) {
      console.error("Failed to save push subscription on server");
    } else {
      console.log("✅ Push subscription saved on server");
    }

    try {
      window.localStorage.setItem(VAPID_PUBLIC_KEY_STORAGE_KEY, publicKey);
    } catch {
      // The subscription still works for the current browser session.
    }

    return subscription;
  } catch (error) {
    console.error("Failed to subscribe to push notifications:", error);
    return null;
  }
}

/**
 * Convert base64 string to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer.slice(0);
}

/**
 * Get current push subscription
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await getNotificationServiceWorkerRegistration();
    if (!registration) {
      return null;
    }

    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Send a real Web Push notification via the Next.js API route.
 */
export async function sendWebPushNotification({
  body,
  icon,
  publicKey,
  tag,
  title,
  url,
}: {
  body: string;
  icon?: string;
  publicKey: string;
  tag: string;
  title: string;
  url?: string;
}): Promise<WebPushSendResult> {
  if (!publicKey) {
    return { sent: false, error: "missing-vapid-public-key" };
  }

  const subscription = await subscribeToPushNotifications(publicKey);

  if (!subscription) {
    return { sent: false, error: "missing-push-subscription" };
  }

  try {
    const response = await fetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        icon,
        subscription: subscription.toJSON(),
        tag,
        title,
        url,
      }),
    });

    if (response.ok) {
      return { sent: true };
    }

    if (response.status === 404 || response.status === 410) {
      await subscription.unsubscribe().catch(() => undefined);
      return { sent: false, expired: true, error: "subscription-expired" };
    }

    const data = await response.json().catch(() => null);
    return {
      sent: false,
      error: data?.error || `push-send-failed-${response.status}`,
    };
  } catch (error) {
    console.error("Failed to send web push notification:", error);
    return { sent: false, error: "push-send-network-error" };
  }
}

/**
 * Play a notification sound alert
 * Uses the Web Audio API or plays a simple beep
 */
export async function playNotificationSound(
  volumeLevel: number = 0.5,
): Promise<boolean> {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return false;
  }

  try {
    const audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();

    // Create a pleasant notification sound (two tones)
    const now = audioContext.currentTime;
    const duration = 0.5;

    // First tone (higher pitch)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();

    osc1.connect(gain1);
    gain1.connect(audioContext.destination);

    osc1.frequency.value = 800; // Hz
    osc1.type = "sine";
    gain1.gain.setValueAtTime(volumeLevel, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc1.start(now);
    osc1.stop(now + duration);

    // Second tone (lower pitch) - starts slightly after first
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();

    osc2.connect(gain2);
    gain2.connect(audioContext.destination);

    osc2.frequency.value = 600; // Hz
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0, now + duration * 0.5);
    gain2.gain.setValueAtTime(volumeLevel, now + duration * 0.5);
    gain2.gain.exponentialRampToValueAtTime(
      0.01,
      now + duration + duration * 0.5,
    );

    osc2.start(now + duration * 0.5);
    osc2.stop(now + duration + duration * 0.5);

    return true;
  } catch {
    return false;
  }
}

/**
 * Show browser notification with permission handling
 */
export async function showBrowserNotification({
  body,
  tag,
  title,
  icon,
}: {
  body: string;
  tag: string;
  title: string;
  icon?: string;
}): Promise<boolean> {
  if (getNotificationPermissionState() !== "granted") {
    return false;
  }

  const options: NotificationOptions = {
    body,
    tag,
    icon: icon || "/favicon.ico",
    badge: "/favicon.ico",
  };

  if ("serviceWorker" in navigator) {
    try {
      const registration = await getNotificationServiceWorkerRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    } catch {
      // Fall through to the regular Notification constructor.
    }
  }

  try {
    new window.Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Show a comprehensive notification with browser notification, sound, and optional callback
 */
export async function showComprehensiveNotification({
  title,
  body,
  tag,
  icon,
  playSound = true,
  volumeLevel = 0.5,
}: {
  title: string;
  body: string;
  tag: string;
  icon?: string;
  playSound?: boolean;
  volumeLevel?: number;
}): Promise<{
  notificationShown: boolean;
  soundPlayed: boolean;
}> {
  let notificationShown = false;
  let soundPlayed = false;

  try {
    // Show browser notification (Windows corner)
    notificationShown = await showBrowserNotification({
      title,
      body,
      tag,
      icon,
    });

    // Play sound alert
    if (playSound) {
      soundPlayed = await playNotificationSound(volumeLevel);
    }
  } catch {
    // Error handling is done in the individual functions
  }

  return { notificationShown, soundPlayed };
}
