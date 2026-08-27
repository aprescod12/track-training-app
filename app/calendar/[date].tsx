import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../lib/theme";
import {
  getAthleteAssignments,
  type AthleteAssignment,
} from "../../lib/training";

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

function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPrettyDate(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function assignmentStatus(row: AthleteAssignment) {
  if (row.assignment_status === "cancelled") return "Cancelled";
  if (row.completion_status === "completed") return "Completed";
  if (row.completion_status === "partially_completed") return "Partially completed";
  if (row.completion_status === "modified") return "Modified";
  if (row.completion_status === "skipped") return "Skipped";
  if (row.completion_status === "unavailable") return "Unavailable";
  if (row.assignment_status === "closed") return "Closed";
  return "Assigned";
}

export default function CalendarDayScreen() {
  const c = useAppColors();
  const { date } = useLocalSearchParams<{ date: string }>();
  const day = typeof date === "string" ? date : "";

  const [error, setError] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [assignments, setAssignments] = useState<AthleteAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!day) return;
    setLoading(true);
    setError(null);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (userError || !uid) throw userError ?? new Error("Not logged in");

      const [year, month, dateOfMonth] = day.split("-").map(Number);
      const dayStart = new Date(year, (month ?? 1) - 1, dateOfMonth ?? 1, 0, 0, 0, 0);
      const dayEnd = new Date(year, (month ?? 1) - 1, (dateOfMonth ?? 1) + 1, 0, 0, 0, 0);

      const [workoutsRes, eventsRes, assignmentRows] = await Promise.all([
        supabase
          .from("workouts")
          .select(`
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
          `)
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
        getAthleteAssignments({ startDate: day, endDate: day }),
      ]);

      if (workoutsRes.error) throw workoutsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      setWorkouts((workoutsRes.data as any) ?? []);
      setEvents((eventsRes.data as CalendarEvent[]) ?? []);
      setAssignments(assignmentRows);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setWorkouts([]);
      setEvents([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
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
    <FormScreen refreshControlProps={{ refreshing, onRefresh }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
          {day ? formatPrettyDate(day) : "Selected Day"}
        </Text>
        {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}
      </View>

      {loading && (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: c.text }}>Loading…</Text>
        </View>
      )}

      <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Actions</Text>
        <PrimaryButton title="Team training" onPress={() => router.push("/team-training")} />
        <PrimaryButton title="Add event" onPress={() => router.push(`/calendar/add-event?date=${day}`)} />
        <PrimaryButton title="Log workout" onPress={() => router.push(`/modal?date=${day}`)} />
      </View>

      {assignments.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Assigned workouts</Text>
          {assignments.map((assignment) => (
            <Pressable
              key={assignment.assignment_recipient_id}
              onPress={() => router.push(`/team-training/assignment/${assignment.assignment_recipient_id}`)}
              style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 6 }}
            >
              <Text style={{ fontWeight: "800", color: c.text }}>{assignment.title_snapshot}</Text>
              <Text style={{ color: c.subtext }}>
                {assignment.team_name ?? "Team"} · {assignmentStatus(assignment)}
              </Text>
              {!!assignment.instructions && (
                <Text style={{ color: c.subtext }} numberOfLines={3}>{assignment.instructions}</Text>
              )}
              <Text style={{ fontWeight: "700", color: c.text }}>Open assignment →</Text>
            </Pressable>
          ))}
        </View>
      )}

      {events.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Events</Text>
          {events.map((event) => (
            <Pressable key={event.id} onPress={() => router.push(`/calendar/event/${event.id}`)} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontWeight: "800", flex: 1, color: c.text }}>{event.title}</Text>
                <Text style={{ color: c.subtext }}>{formatEventTime(event.starts_at)}</Text>
              </View>
              {!!event.ends_at && <Text style={{ color: c.subtext }}>Ends at {formatEventTime(event.ends_at)}</Text>}
              {!!event.notes && <Text style={{ color: c.subtext }} numberOfLines={3}>{event.notes}</Text>}
              <Text style={{ fontWeight: "700", color: c.text }}>View event →</Text>
            </Pressable>
          ))}
        </View>
      )}

      {workouts.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Workouts</Text>
          {workouts.map((workout) => (
            <Pressable key={workout.id} onPress={() => router.push(`/workout/${workout.id}`)} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontWeight: "800", color: c.text, flex: 1 }}>{workout.title}</Text>
                <Text style={{ color: c.subtext }}>{workout.workout_type === "lift" ? "Lift" : "Track"}</Text>
              </View>
              {!!workout.notes && <Text style={{ color: c.subtext }} numberOfLines={3}>{workout.notes}</Text>}
              {!!workout.workout_entries?.length && (
                <Text style={{ color: c.subtext }}>
                  {workout.workout_entries.slice(0, 3).map((entry) => entry.exercises?.name ?? entry.exercise ?? "Exercise").join(" · ")}
                </Text>
              )}
              <Text style={{ fontWeight: "700", color: c.text }}>View workout →</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!loading && assignments.length === 0 && events.length === 0 && workouts.length === 0 && (
        <Text style={{ color: c.subtext }}>Nothing scheduled or logged for this day.</Text>
      )}
    </FormScreen>
  );
}
