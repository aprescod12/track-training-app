import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export function initNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureNotifPermission() {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== "granted") return false;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  return true;
}

export async function scheduleEventReminder(params: {
  title: string;
  body?: string;
  triggerDate: Date;
}) {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body ?? "",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: params.triggerDate,
    },
  });

  return id;
}

export async function cancelReminder(notificationId: string) {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}