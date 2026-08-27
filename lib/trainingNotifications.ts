import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { ensureNotifPermission } from "./notifications";
import type { AthleteAssignment, CoachAssignment } from "./training";

const ATHLETE_KEY = "training-notifications:athlete:v1";
const COACH_KEY = "training-notifications:coach:v1";

type AthleteSnapshot = Record<
  string,
  {
    assignmentUpdatedAt: string;
    status: string;
    dueAt: string | null;
    dueNotificationId: string | null;
  }
>;

type CoachSnapshot = Record<
  string,
  {
    submissionId: string | null;
    submissionUpdatedAt: string | null;
    reviewedAt: string | null;
  }
>;

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function sendGenericNotification(title: string, body: string, url?: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: url ? { url } : {},
    },
    trigger: null,
  });
}

function dueTriggerDate(row: AthleteAssignment) {
  if (row.assignment_status !== "scheduled") return null;
  if (row.due_at) {
    const due = new Date(row.due_at);
    if (!Number.isNaN(due.getTime()) && due.getTime() > Date.now()) return due;
  }

  const fallback = new Date(`${row.scheduled_date}T08:00:00`);
  if (Number.isNaN(fallback.getTime()) || fallback.getTime() <= Date.now()) return null;
  return fallback;
}

async function scheduleDueReminder(row: AthleteAssignment) {
  const triggerDate = dueTriggerDate(row);
  if (!triggerDate) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Team workout reminder",
      body: `${row.title_snapshot} is scheduled for ${row.scheduled_date}.`,
      data: { url: `/team-training/assignment/${row.assignment_recipient_id}` },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

export async function syncAthleteTrainingNotifications(rows: AthleteAssignment[]) {
  try {
    if (!(await ensureNotifPermission())) return;

    const previous = await readJson<AthleteSnapshot>(ATHLETE_KEY);
    const next: AthleteSnapshot = {};
    const firstSync = previous === null;

    for (const row of rows) {
      const old = previous?.[row.assignment_recipient_id];
      let dueNotificationId = old?.dueNotificationId ?? null;

      const reminderNeedsRefresh =
        !old ||
        old.assignmentUpdatedAt !== row.assignment_updated_at ||
        old.dueAt !== row.due_at ||
        old.status !== row.assignment_status;

      if (reminderNeedsRefresh && dueNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(dueNotificationId).catch(() => {});
        dueNotificationId = null;
      }

      if (reminderNeedsRefresh && row.assignment_status === "scheduled") {
        dueNotificationId = await scheduleDueReminder(row);
      }

      if (!firstSync && !old) {
        await sendGenericNotification(
          "New team workout",
          `${row.title_snapshot} has been added to your training schedule.`,
          `/team-training/assignment/${row.assignment_recipient_id}`
        );
      } else if (!firstSync && old && old.assignmentUpdatedAt !== row.assignment_updated_at) {
        const cancelled = row.assignment_status === "cancelled";
        await sendGenericNotification(
          cancelled ? "Team workout cancelled" : "Team workout updated",
          cancelled
            ? `${row.title_snapshot} was cancelled.`
            : `${row.title_snapshot} has an updated training schedule.`,
          `/team-training/assignment/${row.assignment_recipient_id}`
        );
      }

      next[row.assignment_recipient_id] = {
        assignmentUpdatedAt: row.assignment_updated_at,
        status: row.assignment_status,
        dueAt: row.due_at,
        dueNotificationId,
      };
    }

    for (const [recipientId, old] of Object.entries(previous ?? {})) {
      if (!next[recipientId] && old.dueNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(old.dueNotificationId).catch(() => {});
      }
    }

    await AsyncStorage.setItem(ATHLETE_KEY, JSON.stringify(next));
  } catch (error) {
    console.log("training athlete notification sync error:", error);
  }
}

export async function syncCoachTrainingNotifications(rows: CoachAssignment[]) {
  try {
    if (!(await ensureNotifPermission())) return;

    const previous = await readJson<CoachSnapshot>(COACH_KEY);
    const next: CoachSnapshot = {};
    const firstSync = previous === null;

    for (const row of rows) {
      const old = previous?.[row.assignment_recipient_id];
      const hasNewSubmission = Boolean(row.submission_id) && old?.submissionId !== row.submission_id;
      const revisedAfterReview =
        Boolean(row.submission_id) &&
        Boolean(old?.reviewedAt) &&
        old?.submissionUpdatedAt !== row.submission_updated_at &&
        row.reviewed_at === null;

      if (!firstSync && revisedAfterReview) {
        await sendGenericNotification(
          "Assignment submission revised",
          "An athlete revised a previously reviewed assignment submission.",
          `/team-training/assignment/${row.assignment_recipient_id}`
        );
      } else if (!firstSync && hasNewSubmission) {
        await sendGenericNotification(
          "Assignment update received",
          "An athlete submitted a team workout update.",
          `/team-training/assignment/${row.assignment_recipient_id}`
        );
      }

      next[row.assignment_recipient_id] = {
        submissionId: row.submission_id,
        submissionUpdatedAt: row.submission_updated_at,
        reviewedAt: row.reviewed_at,
      };
    }

    await AsyncStorage.setItem(COACH_KEY, JSON.stringify(next));
  } catch (error) {
    console.log("training coach notification sync error:", error);
  }
}
