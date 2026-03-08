import { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal } from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import FormScreen from "../../../components/FormScreen";
import PrimaryButton from "../../../components/PrimaryButton";
import { supabase } from "../../../lib/supabase";
import { useAppColors } from "../../../lib/theme";
import { cancelReminder } from "../../../lib/notifications";

type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  reminder_minutes: number | null;
  notification_id: string | null;
  created_at: string;
};

function ymdLocal(ts: string) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReminder(minutes: number | null) {
  if (minutes == null) return "No reminder";
  if (minutes === 60) return "1 hour before";
  if (minutes === 1440) return "1 day before";
  return `${minutes} minutes before`;
}

export default function EventDetailScreen() {
  const c = useAppColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = typeof id === "string" ? id : "";

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setStatus("Missing event id");
      setEvent(null);
      return;
    }

    setLoading(true);
    setStatus("Loading...");

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    if (userErr || !uid) {
      setStatus("Not logged in");
      setEvent(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, title, notes, starts_at, ends_at, reminder_minutes, notification_id, created_at")
      .eq("id", eventId)
      .eq("user_id", uid)
      .single();

    if (error) {
      setStatus("Error: " + error.message);
      setEvent(null);
      setLoading(false);
      return;
    }

    setEvent(data as CalendarEvent);
    setStatus("Loaded ✅");
    setLoading(false);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDelete() {
    if (!event || deleting) return;

    try {
      setDeleting(true);
      setStatus("Deleting...");

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (userErr || !uid) {
        setStatus("Not logged in");
        return;
      }

      if (event.notification_id) {
        try {
          await cancelReminder(event.notification_id);
        } catch {
          // ignore reminder cancel failure
        }
      }

      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", event.id)
        .eq("user_id", uid);

      if (error) {
        setStatus("Error: " + error.message);
        return;
      }

      setStatus("Deleted ✅");
      setConfirmOpen(false);
      router.replace(`/calendar/${ymdLocal(event.starts_at)}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <FormScreen>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Event</Text>
        <Text style={{ color: c.subtext }}>{status}</Text>
      </View>

      {loading && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: c.text }}>Loading…</Text>
        </View>
      )}

      {event && (
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
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>{event.title}</Text>
              <Text style={{ color: c.subtext }}>{formatDateTime(event.starts_at)}</Text>
            </View>

            <View style={{ gap: 10 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                  borderRadius: 12,
                  padding: 12,
                  gap: 4,
                }}
              >
                <Text style={{ fontWeight: "800", color: c.text }}>Starts</Text>
                <Text style={{ color: c.subtext }}>{formatDateTime(event.starts_at)}</Text>
              </View>

              {!!event.ends_at && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 12,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <Text style={{ fontWeight: "800", color: c.text }}>Ends</Text>
                  <Text style={{ color: c.subtext }}>{formatDateTime(event.ends_at)}</Text>
                </View>
              )}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                  borderRadius: 12,
                  padding: 12,
                  gap: 4,
                }}
              >
                <Text style={{ fontWeight: "800", color: c.text }}>Reminder</Text>
                <Text style={{ color: c.subtext }}>{formatReminder(event.reminder_minutes)}</Text>
              </View>

              {!!event.notes && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 12,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <Text style={{ fontWeight: "800", color: c.text }}>Notes</Text>
                  <Text style={{ color: c.subtext }}>{event.notes}</Text>
                </View>
              )}
            </View>

            <View style={{ gap: 10 }}>
              <PrimaryButton
                title="Edit event"
                onPress={() => router.push(`/calendar/add-event?eventId=${event.id}`)}
                disabled={deleting}
              />
              <PrimaryButton
                title={deleting ? "Deleting..." : "Delete event"}
                onPress={() => setConfirmOpen(true)}
                disabled={deleting}
              />
            </View>
          </View>
        </>
      )}

      <Modal visible={confirmOpen} transparent animationType="fade">
        <Pressable
          onPress={() => !deleting && setConfirmOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 16,
              padding: 18,
              gap: 14,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>Delete event?</Text>
            <Text style={{ color: c.subtext }}>
              This will permanently delete this event{event?.title ? `: "${event.title}"` : ""}.
            </Text>

            {deleting && (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: c.text }}>Deleting…</Text>
              </View>
            )}

            <View style={{ gap: 10 }}>
              <PrimaryButton title="Cancel" onPress={() => setConfirmOpen(false)} disabled={deleting} />
              <PrimaryButton title="Delete permanently" disabled={deleting} onPress={handleDelete} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FormScreen>
  );
}