import { useEffect, useRef } from "react";
import { dueReminders, pruneSentKeys } from "../core/reminders";
import { notificationPermission, sendNotification } from "../platform/notify";
import { useStore } from "./store";

const SENT_KEY = "studyflow:reminders-sent";

function loadSent(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSent(sent: Set<string>): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent]));
  } catch {
    /* storage full or unavailable: worst case a reminder repeats once */
  }
}

/**
 * Sends deadline reminders while the app is running. Re-evaluates whenever the
 * clock ticks (every 30s) or assessments change. Sent reminders are remembered
 * per device, so restarting the app never repeats them.
 *
 * Limitation: reminders only fire while StudyFlow is open (or minimised).
 * OS-level scheduled notifications that fire with the app closed need the
 * platform-specific scheduling APIs and are a separate step.
 */
export function useReminders(): void {
  const enabled = useStore((s) => s.settings.notifications);
  const status = useStore((s) => s.status);
  const assessments = useStore((s) => s.assessments);
  const courses = useStore((s) => s.courses);
  const today = useStore((s) => s.today);
  const now = useStore((s) => s.now);
  const timeFormat = useStore((s) => s.settings.timeFormat);
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || status !== "ready" || running.current) return;
    running.current = true;
    void (async () => {
      try {
        if ((await notificationPermission()) !== "granted") return;
        const sent = new Set(pruneSentKeys(loadSent(), today));
        const reminders = dueReminders(assessments, courses, today, now, sent, timeFormat);
        for (const r of reminders) {
          await sendNotification(r.title, r.body);
          r.keys.forEach((k) => sent.add(k));
        }
        saveSent(sent);
      } catch (err) {
        console.warn("[reminders] could not send:", err);
      } finally {
        running.current = false;
      }
    })();
  }, [enabled, status, assessments, courses, today, now, timeFormat]);
}
