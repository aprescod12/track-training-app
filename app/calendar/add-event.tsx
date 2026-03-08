import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Alert, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  ensureNotifPermission,
  scheduleEventReminder,
  cancelReminder,
} from "../../lib/notifications";
import { useAppColors } from "../../lib/theme";
import FormScreen from "../../components/FormScreen";

const REMINDER_OPTIONS = [
  { label: "No reminder", minutes: null },
  { label: "10 minutes before", minutes: 10 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
] as const;

type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  reminder_minutes: number | null;
  notification_id: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localDateTimeToISO(dateYMD: string, hh: number, mm: number) {
  const [y, m, d] = dateYMD.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  return dt.toISOString();
}

function ymdLocal(ts: string) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AddEventScreen() {
  const c = useAppColors();

  const placeholderColor = "#8A8A8A";
  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.bg,
    color: c.text,
  } as const;

  const params = useLocalSearchParams<{ date?: string; eventId?: string }>();

  const eventId = useMemo(
    () => (typeof params.eventId === "string" ? params.eventId : ""),
    [params.eventId]
  );

  const isEdit = !!eventId;

  const [initialDate, setInitialDate] = useState(
    typeof params.date === "string" ? params.date : new Date().toISOString().slice(0, 10)
  );

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const [hour, setHour] = useState(String(new Date().getHours()));
  const [minute, setMinute] = useState(pad2(new Date().getMinutes()));

  const [reminderIdx, setReminderIdx] = useState(1);

  const [existingEvent, setExistingEvent] = useState<CalendarEvent | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const reminderMinutes = REMINDER_OPTIONS[reminderIdx]?.minutes ?? null;

  const loadExistingEvent = useCallback(async () => {
    if (!eventId) return;

    setLoadingExisting(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setLoadingExisting(false);
      Alert.alert("Error", "Not signed in.");
      return;
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, title, notes, starts_at, ends_at, reminder_minutes, notification_id")
      .eq("id", eventId)
      .eq("user_id", user.id)
      .single();

    setLoadingExisting(false);

    if (error) {
      Alert.alert("Could not load event", error.message);
      return;
    }

    const event = data as CalendarEvent;
    const start = new Date(event.starts_at);

    setExistingEvent(event);
    setTitle(event.title ?? "");
    setNotes(event.notes ?? "");
    setInitialDate(ymdLocal(event.starts_at));
    setHour(String(start.getHours()));
    setMinute(pad2(start.getMinutes()));

    const idx = REMINDER_OPTIONS.findIndex((opt) => opt.minutes === event.reminder_minutes);
    setReminderIdx(idx >= 0 ? idx : 0);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      if (isEdit) loadExistingEvent();
    }, [isEdit, loadExistingEvent])
  );

  async function onSave() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert("Missing title", "Please add an event title.");
      return;
    }

    const hh = Math.max(0, Math.min(23, parseInt(hour || "0", 10)));
    const mm = Math.max(0, Math.min(59, parseInt(minute || "0", 10)));

    const startsAtISO = localDateTimeToISO(initialDate, hh, mm);
    const startsAtDate = new Date(startsAtISO);

    if (Number.isNaN(startsAtDate.getTime())) {
      Alert.alert("Invalid time", "Please enter a valid time.");
      return;
    }

    setSaving(true);

    try {
      let notificationId: string | null = existingEvent?.notification_id ?? null;

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) throw new Error("Not signed in.");

      if (isEdit && existingEvent?.notification_id) {
        try {
          await cancelReminder(existingEvent.notification_id);
        } catch {
          // ignore cancel failure so save can still continue
        }
        notificationId = null;
      }

      if (reminderMinutes != null) {
        const ok = await ensureNotifPermission();

        if (!ok) {
          Alert.alert(
            "Notifications disabled",
            "You can still save the event, but reminders won’t be sent unless notifications are enabled."
          );
        } else {
          const trigger = new Date(startsAtDate.getTime() - reminderMinutes * 60 * 1000);
          if (trigger.getTime() > Date.now()) {
            notificationId = await scheduleEventReminder({
              title: "Upcoming event",
              body: cleanTitle,
              triggerDate: trigger,
            });
          } else {
            notificationId = null;
          }
        }
      } else {
        notificationId = null;
      }

      if (isEdit) {
        const { error } = await supabase
          .from("calendar_events")
          .update({
            title: cleanTitle,
            notes: notes.trim() || null,
            starts_at: startsAtISO,
            reminder_minutes: reminderMinutes,
            notification_id: notificationId,
          })
          .eq("id", eventId)
          .eq("user_id", user.id);

        if (error) throw error;

        router.replace(`/calendar/event/${eventId}`);
        return;
      }

      const { error } = await supabase.from("calendar_events").insert({
        user_id: user.id,
        title: cleanTitle,
        notes: notes.trim() || null,
        starts_at: startsAtISO,
        reminder_minutes: reminderMinutes,
        notification_id: notificationId,
      });

      if (error) throw error;

      router.back();
    } catch (e: any) {
      Alert.alert(isEdit ? "Could not update event" : "Could not save event", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
  <View style={{ flex: 1, gap: 4 }}>
    <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
      {isEdit ? "Edit Event" : "Add Event"}
    </Text>
    <Text style={{ color: c.subtext }}>
      {isEdit ? "Update the event details below." : `Add a calendar item for ${initialDate}.`}
    </Text>
  </View>

  <Pressable
    onPress={() => router.back()}
    style={{
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: c.card,
    }}
  >
    <Text style={{ fontWeight: "600", color: c.text }}>Cancel</Text>
  </Pressable>
</View>

      {loadingExisting ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 14,
            padding: 14,
            backgroundColor: c.card,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: c.text }}>Loading event…</Text>
        </View>
      ) : (
        <>
          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 14,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Event Details</Text>

            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "800", color: c.text }}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Meet, practice, race, lifting…"
                placeholderTextColor={placeholderColor}
                style={inputStyle}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "800", color: c.text }}>Date</Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ fontWeight: "700", color: c.text }}>{initialDate}</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: c.text }}>Hour (0–23)</Text>
                <TextInput
                  value={hour}
                  onChangeText={setHour}
                  keyboardType="number-pad"
                  placeholder="9"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
              </View>

              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: c.text }}>Minute (0–59)</Text>
                <TextInput
                  value={minute}
                  onChangeText={setMinute}
                  keyboardType="number-pad"
                  placeholder="00"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "800", color: c.text }}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything you want to remember"
                placeholderTextColor={placeholderColor}
                multiline
                style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
              />
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 14,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Reminder</Text>
            <Text style={{ color: c.subtext }}>
              Choose when you want to be reminded before the event starts.
            </Text>

            <View style={{ gap: 8 }}>
              {REMINDER_OPTIONS.map((opt, idx) => {
                const selected = idx === reminderIdx;

                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => setReminderIdx(idx)}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      backgroundColor: selected ? c.primary : c.bg,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        color: selected ? c.primaryText : c.text,
                      }}
                    >
                      {selected ? `✓ ${opt.label}` : opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={onSave}
            disabled={saving}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 14,
              alignItems: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }}>
                  {isEdit ? "Saving changes…" : "Saving…"}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>
                {isEdit ? "Save changes" : "Save event"}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </FormScreen>
  );
}