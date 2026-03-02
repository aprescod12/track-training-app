import { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Alert, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { ensureNotifPermission, scheduleEventReminder } from "../../lib/notifications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppColors } from "../../lib/theme";
import FormScreen from "../../components/FormScreen";

const REMINDER_OPTIONS = [
  { label: "No reminder", minutes: null },
  { label: "10 minutes before", minutes: 10 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localDateTimeToISO(dateYMD: string, hh: number, mm: number) {
  const [y, m, d] = dateYMD.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  return dt.toISOString();
}

export default function AddEventScreen() {
  const c = useAppColors();

  const placeholderColor = "#8A8A8A";
  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.card,
    color: c.text,
  } as const;

  const labelStyle = { fontWeight: "800", color: c.text } as const;
  const subTextStyle = { color: c.subtext } as const;

  const params = useLocalSearchParams<{ date?: string }>();
  const initialDate = useMemo(
    () => params.date ?? new Date().toISOString().slice(0, 10),
    [params.date]
  );

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const [hour, setHour] = useState(String(new Date().getHours()));
  const [minute, setMinute] = useState(pad2(new Date().getMinutes()));

  const [reminderIdx, setReminderIdx] = useState(1);
  const [saving, setSaving] = useState(false);

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

    const reminderMinutes = REMINDER_OPTIONS[reminderIdx]?.minutes ?? null;

    setSaving(true);
    try {
      let notificationId: string | null = null;

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
          }
        }
      }

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) throw new Error("Not signed in.");

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
      Alert.alert("Could not save event", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen contentContainerStyle={{ paddingBottom: 28 }}>
    <Stack.Screen options={{ title: "Add Event" }} />

    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Pressable onPress={() => router.back()} style={{ paddingVertical: 8, paddingRight: 8 }}>
        <Text style={{ fontWeight: "800", color: c.text }}>← Back</Text>
      </Pressable>
    </View>

          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Meet, practice, race, lifting…"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>Date</Text>
            <Text style={subTextStyle}>{initialDate}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={labelStyle}>Hour (0–23)</Text>
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
              <Text style={labelStyle}>Minute (0–59)</Text>
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

          <View style={{ gap: 8 }}>
            <Text style={labelStyle}>Reminder</Text>
            <View style={{ gap: 8 }}>
              {REMINDER_OPTIONS.map((opt, idx) => {
                const selected = idx === reminderIdx;
                return (
                  <PrimaryButton
                    key={opt.label}
                    title={selected ? `✓ ${opt.label}` : opt.label}
                    onPress={() => setReminderIdx(idx)}
                  />
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>Notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything you want to remember"
              placeholderTextColor={placeholderColor}
              multiline
              style={[inputStyle, { minHeight: 90 }]}
            />
          </View>

          <PrimaryButton title={saving ? "Saving..." : "Save event"} onPress={onSave} disabled={saving} />
      </FormScreen>
  );
}