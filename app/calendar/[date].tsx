import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import FormScreen from "../../components/FormScreen";
import { supabase } from "../../lib/supabase";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";

type Entry = {
  id: string;
  exercise_id: string | null;
  exercises?: { name: string } | null;
  exercise: string | null;
};

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: "track" | "lift";
  workout_entries: Entry[];
};

type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
};

function formatEventTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPrettyDate(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return ymd;

  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function CalendarDayScreen() {
  const c = useAppColors();

  const { date } = useLocalSearchParams<{ date: string }>();
  const day = typeof date === "string" ? date : "";

  const [error, setError] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!day) return;

    setLoading(true);
    setError(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    if (userErr || !uid) {
      setError("Not logged in");
      setWorkouts([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    const [y, m, d] = day.split("-").map(Number);
    const dayStart = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    const dayEnd = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1, 0, 0, 0, 0);

    const [workoutsRes, eventsRes] = await Promise.all([
      supabase
        .from("workouts")
        .select(
          `
          id,
          workout_date,
          title,
          notes,
          workout_type,
          workout_entries(
            id,
            exercise_id,
            exercises(name),
            exercise
          )
        `
        )
        .eq("user_id", uid)
        .eq("workout_date", day)
        .order("created_at", { ascending: false }),

      supabase
        .from("calendar_events")
        .select("id, title, notes, starts_at, ends_at")
        .eq("user_id", uid)
        .gte("starts_at", dayStart.toISOString())
        .lt("starts_at", dayEnd.toISOString())
        .order("starts_at", { ascending: true }),
    ]);

    if (workoutsRes.error) {
      setError("Error: " + workoutsRes.error.message);
      setWorkouts([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    if (eventsRes.error) {
      setError("Error: " + eventsRes.error.message);
      setWorkouts([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setWorkouts((workoutsRes.data as any) ?? []);
    setEvents((eventsRes.data as CalendarEvent[]) ?? []);
    setLoading(false);
  }, [day]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <FormScreen
      refreshControlProps={{
        refreshing,
        onRefresh,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
          {day ? formatPrettyDate(day) : "Selected Day"}
        </Text>
        {error && (
          <Text style={{ color: "#ef4444", fontWeight: "600" }}>
            {error}
          </Text>
        )}
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

      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Actions</Text>
        <PrimaryButton title="Add event" onPress={() => router.push(`/calendar/add-event?date=${day}`)} />
        <PrimaryButton title="Log workout" onPress={() => router.push(`/modal?date=${day}`)} />
      </View>

      {!!events.length && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Events</Text>

          {events.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => router.push(`/calendar/event/${e.id}`)}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 14,
                padding: 12,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontWeight: "800", flex: 1, color: c.text }}>{e.title}</Text>
                <Text style={{ color: c.subtext }}>{formatEventTime(e.starts_at)}</Text>
              </View>

              {!!e.ends_at && (
                <Text style={{ color: c.subtext }}>
                  Ends at {formatEventTime(e.ends_at)}
                </Text>
              )}

              {!!e.notes && (
                <Text style={{ color: c.subtext }} numberOfLines={3}>
                  {e.notes}
                </Text>
              )}

              <Text style={{ fontWeight: "700", color: c.text }}>View event →</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!workouts.length && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Workouts</Text>

          {workouts.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => router.push(`/workout/${w.id}`)}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 14,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontWeight: "800", flex: 1, color: c.text }} numberOfLines={2}>
                  {w.title}
                </Text>
                <Text style={{ color: c.subtext, fontWeight: "700" }}>
                  {w.workout_type === "track" ? "Track" : "Lift"}
                </Text>
              </View>

              {!!w.notes && (
                <Text style={{ color: c.subtext }} numberOfLines={3}>
                  {w.notes}
                </Text>
              )}

              <View style={{ gap: 4 }}>
                <Text style={{ fontWeight: "800", color: c.text }}>Exercises</Text>
                {w.workout_entries?.length ? (
                  w.workout_entries.map((e) => (
                    <Text key={e.id} style={{ color: c.subtext }} numberOfLines={2}>
                      • {e.exercises?.name ?? e.exercise ?? "Entry"}
                    </Text>
                  ))
                ) : (
                  <Text style={{ color: c.subtext }}>No entries.</Text>
                )}
              </View>

              <Text style={{ fontWeight: "700", color: c.text }}>View workout →</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!events.length && !workouts.length && !loading && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ color: c.subtext }}>No events or workouts logged on this day.</Text>
          <PrimaryButton title="Add event" onPress={() => router.push(`/calendar/add-event?date=${day}`)} />
          <PrimaryButton title="Log one now" onPress={() => router.push(`/modal?date=${day}`)} />
        </View>
      )}
    </FormScreen>
  );
}