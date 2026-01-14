import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { TrainingSession } from "../types/training";

const REMINDER_KEY_PREFIX = "talentx.sessionReminder.v1:";

const toReminderKey = (sessionId: string) => `${REMINDER_KEY_PREFIX}${sessionId}`;

const parseStartTimestamp = (session: TrainingSession): number => {
    const rawDate = String((session as any)?.date || "").trim();
    const timePart = String((session as any)?.startTime || "00:00").trim() || "00:00";
    const dateOnly = rawDate.includes("T") ? rawDate.split("T")[0] : rawDate;
    if (!dateOnly) return 0;

    const iso = `${dateOnly}T${timePart}`;
    const ts = new Date(iso).getTime();
    return Number.isNaN(ts) ? 0 : ts;
};

export const cancelSessionStartReminder = async (sessionId: string): Promise<void> => {
    const trimmed = sessionId?.trim();
    if (!trimmed) return;

    const key = toReminderKey(trimmed);
    const existing = await AsyncStorage.getItem(key);
    if (existing) {
        try {
            await Notifications.cancelScheduledNotificationAsync(existing);
        } catch {
            // non-bloquant
        }
        await AsyncStorage.removeItem(key);
    }
};

export const scheduleSessionStartReminder = async (session: TrainingSession, minutesBefore = 30): Promise<void> => {
    const sessionId = String((session as any)?.id || (session as any)?._id || "").trim();
    if (!sessionId) return;

    // Always de-dupe first.
    await cancelSessionStartReminder(sessionId);

    const startTs = parseStartTimestamp(session);
    if (!startTs) return;

    const triggerTs = startTs - minutesBefore * 60 * 1000;
    const now = Date.now();

    // If we're already inside the window, skip (avoid noisy immediate notifications).
    if (triggerTs <= now) return;

    const permissions = await Notifications.getPermissionsAsync();
    const granted = permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
    if (!granted) return;

    const title = "Talent-X";
    const label = (typeof (session as any)?.title === "string" && (session as any).title.trim())
        ? (session as any).title.trim()
        : "Votre séance";

    const secondsUntil = Math.floor((triggerTs - now) / 1000);
    if (!Number.isFinite(secondsUntil) || secondsUntil <= 0) return;

    const identifier = await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body: `${label} commence dans ${minutesBefore} min`,
            data: { kind: "session_reminder", sessionId },
            sound: true,
        },
        trigger: { type: "timeInterval", seconds: secondsUntil, repeats: false } as any,
    });

    await AsyncStorage.setItem(toReminderKey(sessionId), identifier);
};
