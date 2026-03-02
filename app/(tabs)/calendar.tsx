import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, PanResponder } from "react-native";
import { router, useFocusEffect } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: "track" | "lift";
};

type EventRow = {
  id: string;
  starts_at: string; // timestamptz
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

// Convert timestamptz -> YYYY-MM-DD key (local day)
function ymdLocal(ts: string) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarScreen() {
  const c = useAppColors();

  const today = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([]);
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<Workout[]>([]);
  const [monthEvents, setMonthEvents] = useState<EventRow[]>([]);

  const [status, setStatus] = useState("Loading...");
  const [refreshing, setRefreshing] = useState(false);

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

  // ✅ EVENTS count map (YYYY-MM-DD -> count) derived from starts_at
  const eventCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of monthEvents) {
      const key = ymdLocal(e.starts_at);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [monthEvents]);

  const selectedKey = useMemo(() => formatYMD(selectedDate), [selectedDate]);

  const loadMonth = useCallback(async () => {
    setStatus("Loading...");

    const startKey = formatYMD(startOfMonth(monthAnchor));
    const endKey = formatYMD(endOfMonth(monthAnchor));

    // ---- WORKOUTS ----
    const { data: wData, error: wErr } = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes, workout_type")
      .gte("workout_date", startKey)
      .lte("workout_date", endKey)
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (wErr) {
      setStatus("Error: " + wErr.message);
      setMonthWorkouts([]);
      setSelectedDayWorkouts([]);
      setMonthEvents([]);
      return;
    }

    const wRows = (wData ?? []) as Workout[];
    setMonthWorkouts(wRows);

    // ---- EVENTS (calendar_events) ----
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      setMonthEvents([]);
    } else {
      const startDate = startOfMonth(monthAnchor);
      const endExclusive = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);

      const { data: eData, error: eErr } = await supabase
        .from("calendar_events")
        .select("id, starts_at")
        .eq("user_id", userData.user.id)
        .gte("starts_at", startDate.toISOString())
        .lt("starts_at", endExclusive.toISOString())
        .order("starts_at", { ascending: true });

      if (eErr) {
        // don’t block workouts if events fail
        setMonthEvents([]);
      } else {
        setMonthEvents((eData ?? []) as EventRow[]);
      }
    }

    // populate selected day workouts (unchanged)
    const dayRows = wRows.filter((w) => w.workout_date === selectedKey);
    setSelectedDayWorkouts(dayRows);

    setStatus("Loaded ✅");
  }, [monthAnchor, selectedKey]);

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

  function selectDay(d: Date) {
    setSelectedDate(d);
    const key = formatYMD(d);
    setSelectedDayWorkouts(monthWorkouts.filter((w) => w.workout_date === key));
  }

  const prevMonth = useCallback(() => {
    const next = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1);
    setMonthAnchor(next);
  }, [monthAnchor]);

  const nextMonth = useCallback(() => {
    const next = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
    setMonthAnchor(next);
  }, [monthAnchor]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const { dx, dy } = gesture;
          return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy);
        },
        onPanResponderRelease: (_, gesture) => {
          const { dx } = gesture;
          if (dx > 60) prevMonth();
          else if (dx < -60) nextMonth();
        },
      }),
    [prevMonth, nextMonth]
  );

  const dotTrack = c.dark ? "#34D399" : "green";
  const dotLift = c.dark ? "#60A5FA" : "blue";

  return (
      <FormScreen
        refreshControlProps={{
          refreshing,
          onRefresh,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Calendar</Text>
          <PrimaryButton
            title="Add event"
            onPress={() => router.push(`/calendar/add-event?date=${selectedKey}`)}
          />
        </View>

        <Text style={{ color: c.subtext }}>{status}</Text>

        {/* Month card */}
        <View
          {...panResponder.panHandlers}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Pressable onPress={prevMonth} style={{ padding: 8 }}>
              <Text style={{ fontSize: 18, color: c.text }}>‹</Text>
            </Pressable>

            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>{monthLabel}</Text>

            <Pressable onPress={nextMonth} style={{ padding: 8 }}>
              <Text style={{ fontSize: 18, color: c.text }}>›</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row" }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
              <Text
                key={w}
                style={{
                  width: `${100 / 7}%`,
                  textAlign: "center",
                  fontSize: 12,
                  color: c.subtext,
                }}
              >
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

              // ✅ event dot = events only
              const hasEvent = (eventCounts[key] ?? 0) > 0;

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
                  {/* ✅ EVENT DOT ABOVE DATE */}
                  {hasEvent && (
                    <View
                      style={{
                        position: "absolute",
                        top: 1,
                        alignSelf: "center",
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: c.primary,
                        opacity: selected ? 1 : 0.75,
                      }}
                    />
                  )}

                  <View
                    style={{
                      minWidth: 32,
                      height: 32,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: selected ? 2 : isToday ? 1 : 0,
                      borderColor: selected ? c.primary : c.border,
                      backgroundColor: selected ? c.primary : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? c.primaryText : c.text,
                        fontWeight: selected ? "800" : "400",
                      }}
                    >
                      {date.getDate()}
                    </Text>
                  </View>

                  {/* workout indicators BELOW (leave/remove as you want) */}
                  {total > 0 && (
                    <View style={{ marginTop: 4, alignItems: "center", justifyContent: "center" }}>
                      {total <= 2 ? (
                        <View style={{ flexDirection: "row", gap: 4 }}>
                          {trackCount >= 1 && (
                            <View
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                backgroundColor: dotTrack,
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
                                backgroundColor: dotTrack,
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
                                backgroundColor: dotLift,
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
                                backgroundColor: dotLift,
                                opacity: selected ? 0.95 : 0.7,
                              }}
                            />
                          )}
                        </View>
                      ) : (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: c.border,
                            borderRadius: 999,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            opacity: selected ? 1 : 0.9,
                            backgroundColor: c.bg,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "800", color: c.text }}>{total}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Selected day list (workouts list, unchanged) */}
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
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
            {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </Text>

          {selectedDayWorkouts.length ? (
            <>
              {selectedDayWorkouts.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => router.push(`/workout/${w.id}`)}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 14,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: "800", color: c.text }}>{w.title}</Text>
                  {!!w.notes && (
                    <Text numberOfLines={2} style={{ color: c.subtext }}>
                      {w.notes}
                    </Text>
                  )}
                  <Text style={{ fontWeight: "700", color: c.text }}>View →</Text>
                </Pressable>
              ))}

              <PrimaryButton
                title="View workouts on this day"
                onPress={() => router.push(`/calendar/${selectedKey}`)}
              />
            </>
          ) : (
            <>
              <Text style={{ color: c.subtext }}>No workouts logged for this day.</Text>

              <PrimaryButton
                title="Log workout for this day"
                onPress={() => router.push(`/modal?date=${selectedKey}`)}
              />
            </>
          )}
        </View>
      </FormScreen>
  );
}