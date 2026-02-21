import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: "track" | "lift";
};

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
// Monday-first calendar
function weekdayMonFirst(d: Date) {
  return (d.getDay() + 6) % 7; // 0=Mon ... 6=Sun
}
function buildMonthGrid(anchor: Date) {
  const first = startOfMonth(anchor);
  const offset = weekdayMonFirst(first);
  const gridStart = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(gridStart, i);
    return { date, inMonth: date.getMonth() === anchor.getMonth() };
  });
}

export default function CalendarScreen() {
  const today = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([]);
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<Workout[]>([]);
  const [status, setStatus] = useState("Loading...");

  const monthLabel = useMemo(
    () => monthAnchor.toLocaleString(undefined, { month: "long", year: "numeric" }),
    [monthAnchor]
  );

  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);

  const workoutCounts = useMemo(() => {
    const map: Record<string, { track: number; lift: number; total: number }> = {};
    for (const w of monthWorkouts) {
      const key = w.workout_date;
      if (!map[key]) map[key] = { track: 0, lift: 0, total: 0 };
      map[key][w.workout_type] += 1;
      map[key].total += 1;
    }
    return map;
  }, [monthWorkouts]);

  const selectedKey = useMemo(() => formatYMD(selectedDate), [selectedDate]);

  const loadMonth = useCallback(async () => {
    setStatus("Loading...");
    const start = formatYMD(startOfMonth(monthAnchor));
    const end = formatYMD(endOfMonth(monthAnchor));

    const { data, error } = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes, workout_type")
      .gte("workout_date", start)
      .lte("workout_date", end)
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("Error: " + error.message);
      setMonthWorkouts([]);
      setSelectedDayWorkouts([]);
      return;
    }

    const rows = (data ?? []) as Workout[];
    setMonthWorkouts(rows);

    // populate selected day list
    const dayRows = rows.filter((w) => w.workout_date === selectedKey);
    setSelectedDayWorkouts(dayRows);

    setStatus("Loaded ✅");
  }, [monthAnchor, selectedKey]);

  // Reload when you land on Calendar (so highlights update after logging)
  useFocusEffect(
    useCallback(() => {
      loadMonth();
    }, [loadMonth])
  );

  function selectDay(d: Date) {
    setSelectedDate(d);
    const key = formatYMD(d);
    setSelectedDayWorkouts(monthWorkouts.filter((w) => w.workout_date === key));
  }

  function prevMonth() {
    const next = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1);
    setMonthAnchor(next);
  }
  function nextMonth() {
    const next = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
    setMonthAnchor(next);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>Calendar</Text>
        <PrimaryButton
          title="Log workout"
          onPress={() => router.push(`/modal?date=${selectedKey}`)}
        />
      </View>

      <Text style={{ opacity: 0.7 }}>{status}</Text>

      {/* Month card */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={prevMonth} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18 }}>‹</Text>
          </Pressable>

          <Text style={{ fontSize: 16, fontWeight: "800" }}>{monthLabel}</Text>

          <Pressable onPress={nextMonth} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18 }}>›</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <Text key={w} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 12, opacity: 0.7 }}>
              {w}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {grid.map(({ date, inMonth }) => {
            const key = formatYMD(date);
            const counts = workoutCounts[key];
            const trackCount = counts?.track ?? 0;
            const liftCount = counts?.lift ?? 0;
            const total = counts?.total ?? 0;
            const selected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, today);

            return (
              <Pressable
                key={date.toISOString()}
                onPress={() => selectDay(date)}
                style={{
                  width: `${100 / 7}%`,
                  paddingVertical: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: inMonth ? 1 : 0.35,
                }}
              >
                <View
                  style={{
                    minWidth: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: selected ? 2 : isToday ? 1 : 0,
                    backgroundColor: selected ? "black" : "transparent",
                  }}
                >
                  <Text style={{ color: selected ? "white" : "black", fontWeight: selected ? "800" : "400" }}>
                    {date.getDate()}
                  </Text>
                </View>

                {/* indicators below the date number */}
{total > 0 && (
  <View style={{ marginTop: 4, alignItems: "center", justifyContent: "center" }}>
    {total <= 2 ? (
      // Show dots: green for track, blue for lift
      <View style={{ flexDirection: "row", gap: 4 }}>
        {trackCount >= 1 && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: "green",
              opacity: selected ? 0.95 : 0.7,
            }}
          />
        )}
        {trackCount >= 2 && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: "green",
              opacity: selected ? 0.95 : 0.7,
            }}
          />
        )}

        {liftCount >= 1 && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: "blue",
              opacity: selected ? 0.95 : 0.7,
            }}
          />
        )}
        {liftCount >= 2 && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: "blue",
              opacity: selected ? 0.95 : 0.7,
            }}
          />
        )}
      </View>
    ) : (
      // If > 2 workouts total, show TOTAL number
      <View
        style={{
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 1,
          opacity: selected ? 1 : 0.9,
        }}
      >
  <Text style={{ fontSize: 10, fontWeight: "800" }}>{total}</Text>
</View>
    )}
  </View>
)}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Selected day list */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "800" }}>
          {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </Text>

        {selectedDayWorkouts.length ? (
          selectedDayWorkouts.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => router.push(`/workout/${w.id}`)}
              style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}
            >
              <Text style={{ fontWeight: "800" }}>{w.title}</Text>
              {!!w.notes && <Text numberOfLines={2}>{w.notes}</Text>}
              <Text style={{ fontWeight: "700" }}>View →</Text>
            </Pressable>
          ))
        ) : (
          <Text style={{ opacity: 0.7 }}>No workouts logged for this day.</Text>
        )}

        <PrimaryButton
          title="Log workout for this day"
          onPress={() => router.push(`/modal?date=${selectedKey}`)}
        />
      </View>
    </ScrollView>
  );
}