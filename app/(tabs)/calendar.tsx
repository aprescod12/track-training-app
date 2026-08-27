import { useCallback, useMemo, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import { toAppError } from "../../lib/errors";
import { useAppColors } from "../../lib/theme";
import {
  getAthleteAssignments,
  type AthleteAssignment,
} from "../../lib/training";
import { syncAthleteTrainingNotifications } from "../../lib/trainingNotifications";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: "track" | "lift";
};

type EventRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(anchor: Date) {
  const first = startOfMonth(anchor);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return { date, inMonth: date.getMonth() === anchor.getMonth() };
  });
}

function ymdLocal(timestamp: string) {
  return formatYMD(new Date(timestamp));
}

function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
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

export default function CalendarScreen() {
  const c = useAppColors();
  const today = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([]);
  const [monthEvents, setMonthEvents] = useState<EventRow[]>([]);
  const [monthAssignments, setMonthAssignments] = useState<AthleteAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const selectedKey = useMemo(() => formatYMD(selectedDate), [selectedDate]);
  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const monthLabel = useMemo(
    () => monthAnchor.toLocaleString(undefined, { month: "long", year: "numeric" }),
    [monthAnchor]
  );

  const selectedDayWorkouts = useMemo(
    () => monthWorkouts.filter((row) => row.workout_date === selectedKey),
    [monthWorkouts, selectedKey]
  );
  const selectedDayEvents = useMemo(
    () => monthEvents.filter((row) => ymdLocal(row.starts_at) === selectedKey),
    [monthEvents, selectedKey]
  );
  const selectedDayAssignments = useMemo(
    () => monthAssignments.filter((row) => row.scheduled_date === selectedKey),
    [monthAssignments, selectedKey]
  );

  const workoutCounts = useMemo(() => {
    const map: Record<string, { track: number; lift: number; total: number }> = {};
    for (const workout of monthWorkouts) {
      if (!map[workout.workout_date]) {
        map[workout.workout_date] = { track: 0, lift: 0, total: 0 };
      }
      map[workout.workout_date][workout.workout_type] += 1;
      map[workout.workout_date].total += 1;
    }
    return map;
  }, [monthWorkouts]);

  const eventCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const event of monthEvents) {
      const key = ymdLocal(event.starts_at);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [monthEvents]);

  const assignmentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const assignment of monthAssignments) {
      map[assignment.scheduled_date] = (map[assignment.scheduled_date] ?? 0) + 1;
    }
    return map;
  }, [monthAssignments]);

  const loadMonth = useCallback(async () => {
    setError(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (userError || !uid) throw userError ?? new Error("Not logged in");

      const startKey = formatYMD(startOfMonth(monthAnchor));
      const endKey = formatYMD(endOfMonth(monthAnchor));
      const startDate = startOfMonth(monthAnchor);
      const endExclusive = new Date(
        monthAnchor.getFullYear(),
        monthAnchor.getMonth() + 1,
        1
      );

      const [workoutsRes, eventsRes, assignments] = await Promise.all([
        supabase
          .from("workouts")
          .select("id, workout_date, title, notes, workout_type")
          .eq("user_id", uid)
          .gte("workout_date", startKey)
          .lte("workout_date", endKey)
          .order("workout_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("calendar_events")
          .select("id, title, notes, starts_at, ends_at")
          .eq("user_id", uid)
          .gte("starts_at", startDate.toISOString())
          .lt("starts_at", endExclusive.toISOString())
          .order("starts_at", { ascending: true }),
        getAthleteAssignments({ startDate: startKey, endDate: endKey }),
      ]);

      if (workoutsRes.error) throw workoutsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      setMonthWorkouts((workoutsRes.data ?? []) as Workout[]);
      setMonthEvents((eventsRes.data ?? []) as EventRow[]);
      setMonthAssignments(assignments);
      void syncAthleteTrainingNotifications(assignments);
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not load your calendar. Pull to refresh and try again.",
        }).message
      );
      setMonthWorkouts([]);
      setMonthEvents([]);
      setMonthAssignments([]);
    }
  }, [monthAnchor]);

  useFocusEffect(
    useCallback(() => {
      loadMonth();
    }, [loadMonth])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMonth();
    setRefreshing(false);
  }, [loadMonth]);

  const previousMonth = useCallback(() => {
    setMonthAnchor(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
    );
  }, []);

  const nextMonth = useCallback(() => {
    setMonthAnchor(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
    );
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 60) previousMonth();
          else if (gesture.dx < -60) nextMonth();
        },
      }),
    [nextMonth, previousMonth]
  );

  const dotTrack = c.dark ? "#34D399" : "green";
  const dotLift = c.dark ? "#60A5FA" : "blue";

  return (
    <FormScreen refreshControlProps={{ refreshing, onRefresh }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Calendar</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PrimaryButton title="Team training" onPress={() => router.push("/team-training")} />
          <PrimaryButton title="Add event" onPress={() => router.push(`/calendar/add-event?date=${selectedKey}`)} />
        </View>
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}

      <View
        {...panResponder.panHandlers}
        style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={previousMonth} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18, color: c.text }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>{monthLabel}</Text>
          <Pressable onPress={nextMonth} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18, color: c.text }}>›</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
            <Text key={weekday} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 12, color: c.subtext }}>
              {weekday}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {grid.map(({ date, inMonth }) => {
            const key = formatYMD(date);
            const counts = workoutCounts[key];
            const selected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, today);
            const hasEvent = (eventCounts[key] ?? 0) > 0;
            const hasAssignment = (assignmentCounts[key] ?? 0) > 0;

            return (
              <Pressable
                key={date.toISOString()}
                onPress={() => setSelectedDate(date)}
                style={{ width: `${100 / 7}%`, paddingVertical: 10, alignItems: "center", opacity: inMonth ? 1 : 0.35 }}
              >
                <View style={{ position: "absolute", top: 1, flexDirection: "row", gap: 3 }}>
                  {hasEvent && <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: c.primary }} />}
                  {hasAssignment && <View style={{ width: 6, height: 6, borderRadius: 999, borderWidth: 1, borderColor: c.primary, backgroundColor: c.card }} />}
                </View>

                <View style={{ minWidth: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: selected ? 2 : isToday ? 1 : 0, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary : "transparent" }}>
                  <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: selected ? "800" : "400" }}>
                    {date.getDate()}
                  </Text>
                </View>

                {(counts?.total ?? 0) > 0 && (
                  <View style={{ flexDirection: "row", gap: 3, marginTop: 4 }}>
                    {(counts?.track ?? 0) > 0 && <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dotTrack }} />}
                    {(counts?.lift ?? 0) > 0 && <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dotLift }} />}
                    {(counts?.total ?? 0) > 2 && <Text style={{ fontSize: 10, fontWeight: "800", color: c.subtext }}>{counts?.total}</Text>}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Text style={{ color: c.subtext }}>● personal event</Text>
          <Text style={{ color: c.subtext }}>○ assigned workout</Text>
          <Text style={{ color: c.subtext }}>● logged workout</Text>
        </View>
      </View>

      <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
          {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </Text>

        {selectedDayAssignments.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Assigned workouts</Text>
            {selectedDayAssignments.map((assignment) => (
              <Pressable
                key={assignment.assignment_recipient_id}
                onPress={() => router.push(`/team-training/assignment/${assignment.assignment_recipient_id}`)}
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 5 }}
              >
                <Text style={{ fontWeight: "800", color: c.text }}>{assignment.title_snapshot}</Text>
                <Text style={{ color: c.subtext }}>
                  {assignment.team_name ?? "Team"} · {assignmentStatus(assignment)}
                </Text>
                <Text style={{ fontWeight: "700", color: c.text }}>Open assignment →</Text>
              </Pressable>
            ))}
          </View>
        )}

        {selectedDayEvents.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Events</Text>
            {selectedDayEvents.map((event) => (
              <Pressable key={event.id} onPress={() => router.push(`/calendar/event/${event.id}`)} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 5 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <Text style={{ fontWeight: "800", color: c.text, flex: 1 }}>{event.title}</Text>
                  <Text style={{ color: c.subtext }}>{formatEventTime(event.starts_at)}</Text>
                </View>
                {!!event.notes && <Text numberOfLines={2} style={{ color: c.subtext }}>{event.notes}</Text>}
                <Text style={{ fontWeight: "700", color: c.text }}>View event →</Text>
              </Pressable>
            ))}
          </View>
        )}

        {selectedDayWorkouts.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Workouts</Text>
            {selectedDayWorkouts.map((workout) => (
              <Pressable key={workout.id} onPress={() => router.push(`/workout/${workout.id}`)} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 5 }}>
                <Text style={{ fontWeight: "800", color: c.text }}>{workout.title}</Text>
                {!!workout.notes && <Text numberOfLines={2} style={{ color: c.subtext }}>{workout.notes}</Text>}
                <Text style={{ fontWeight: "700", color: c.text }}>View workout →</Text>
              </Pressable>
            ))}
          </View>
        )}

        {selectedDayAssignments.length === 0 && selectedDayEvents.length === 0 && selectedDayWorkouts.length === 0 && (
          <Text style={{ color: c.subtext }}>No events, assigned workouts, or logged workouts for this day.</Text>
        )}

        <View style={{ gap: 8 }}>
          <PrimaryButton title="Log workout for this day" onPress={() => router.push(`/modal?date=${selectedKey}`)} />
          <PrimaryButton title="View full day" onPress={() => router.push(`/calendar/${selectedKey}`)} />
        </View>
      </View>
    </FormScreen>
  );
}
