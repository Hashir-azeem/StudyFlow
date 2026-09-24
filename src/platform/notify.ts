import { isTauri } from "@tauri-apps/api/core";

export type PermissionState = "granted" | "denied" | "default" | "unsupported";

/**
 * System notifications behind one small interface.
 * Tauri (desktop + mobile) → @tauri-apps/plugin-notification.
 * Browser                  → the Web Notification API.
 */
export async function notificationPermission(): Promise<PermissionState> {
  if (isTauri()) {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) ? "granted" : "default";
  }
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (isTauri()) {
    const { requestPermission } = await import("@tauri-apps/plugin-notification");
    const result = await requestPermission();
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "default";
  }
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.requestPermission();
}

export async function sendNotification(title: string, body: string): Promise<void> {
  if (isTauri()) {
    const { sendNotification: send } = await import("@tauri-apps/plugin-notification");
    send({ title, body });
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
