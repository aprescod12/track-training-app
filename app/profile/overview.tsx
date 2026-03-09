import { useCallback, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Pressable, Modal } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { formatYMD } from "../../lib/date";

type WorkoutRow = {
  id: string;
  workout_date: string;
  title: string | null;
  notes: string | null;
  workout_type: "track" | "lift" | string;
};

type EntryRow = {
  reps: number | null;
  sets: number | null;
  exercises: { distance_m: number | null } | { distance_m: number | null }[] | null;
  workouts:
    | {
        user_id: string;
        workout_type: string;
        workout_date: string;
      }
    | {
        user_id: string;
        workout_type: string;
        workout_date: string;
      }[]
    | null;
};

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function prettyDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ProfileOverviewScreen() {
  const c = useAppColors();

  const [loading, setLoading] = useState(true);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [stats, setStats] = useState({
    allTimeWorkouts: 0,
    allTimeTrack: 0,
    allTimeLift: 0,
    allTimeDistanceM: 0,

    weekWorkouts: 0,
    weekTrack: 0,
    weekLift: 0,
    weekDistanceM: 0,
    weekActiveDays: 0,

    monthWorkouts: 0,
    monthTrack: 0,
    monthLift: 0,
    monthDistanceM: 0,
    monthActiveDays: 0,
  });

  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutRow[]>([]);

  const openError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setErrorOpen(true);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (userErr || !uid) {
        setStats({
          allTimeWorkouts: 0,
          allTimeTrack: 0,
          allTimeLift: 0,
          allTimeDistanceM: 0,
          weekWorkouts: 0,
          weekTrack: 0,
          weekLift: 0,
          weekDistanceM: 0,
          weekActiveDays: 0,
          monthWorkouts: 0,
          monthTrack: 0,
          monthLift: 0,
          monthDistanceM: 0,
          monthActiveDays: 0,
        });
        setRecentWorkouts([]);
        return;
      }

      const today = startOfToday();
      const weekStart = addDays(today, -6);
      const monthStart = startOfMonth(today);

      const weekStartKey = formatYMD(weekStart);
      const monthStartKey = formatYMD(monthStart);
      const todayKey = formatYMD(today);

      const { data: workoutRows, error: workoutErr } = await supabase
        .from("workouts")
        .select("id, workout_date, title, notes, workout_type")
        .eq("user_id", uid)
        .order("workout_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (workoutErr) throw workoutErr;

      const workouts = (workoutRows ?? []) as WorkoutRow[];
      setRecentWorkouts(workouts.slice(0, 5));

      const allTimeWorkouts = workouts.length;
      const allTimeTrack = workouts.filter((w) => w.workout_type === "track").length;
      const allTimeLift = workouts.filter((w) => w.workout_type === "lift").length;

      const weekRows = workouts.filter(
        (w) => w.workout_date >= weekStartKey && w.workout_date <= todayKey
      );
      const monthRows = workouts.filter(
        (w) => w.workout_date >= monthStartKey && w.workout_date <= todayKey
      );

      const weekWorkouts = weekRows.length;
      const monthWorkouts = monthRows.length;

      const weekTrack = weekRows.filter((w) => w.workout_type === "track").length;
      const weekLift = weekRows.filter((w) => w.workout_type === "lift").length;
      const monthTrack = monthRows.filter((w) => w.workout_type === "track").length;
      const monthLift = monthRows.filter((w) => w.workout_type === "lift").length;

      const weekActiveDays = new Set(weekRows.map((w) => w.workout_date)).size;
      const monthActiveDays = new Set(monthRows.map((w) => w.workout_date)).size;

      const { data: entryRows, error: entryErr } = await supabase
        .from("workout_entries")
        .select(`
          reps,
          sets,
          exercises(distance_m),
          workouts!inner(user_id, workout_type, workout_date)
        `)
        .eq("user_id", uid)
        .eq("workouts.user_id", uid);

      if (entryErr) throw entryErr;

      let allTimeDistanceM = 0;
      let weekDistanceM = 0;
      let monthDistanceM = 0;

      for (const raw of entryRows ?? []) {
        const r = raw as EntryRow;
        const workout = Array.isArray(r.workouts) ? r.workouts[0] : r.workouts;
        const exercise = Array.isArray(r.exercises) ? r.exercises[0] : r.exercises;

        if (workout?.workout_type !== "track") continue;

        const perRep = Number(exercise?.distance_m ?? 0);
        const reps = Number(r.reps ?? 1);
        const sets = Number(r.sets ?? 1);
        const distance = perRep * reps * sets;
        const workoutDate = workout?.workout_date ?? "";

        allTimeDistanceM += distance;

        if (workoutDate >= weekStartKey && workoutDate <= todayKey) {
          weekDistanceM += distance;
        }

        if (workoutDate >= monthStartKey && workoutDate <= todayKey) {
          monthDistanceM += distance;
        }
      }

      setStats({
        allTimeWorkouts,
        allTimeTrack,
        allTimeLift,
        allTimeDistanceM,
        weekWorkouts,
        weekTrack,
        weekLift,
        weekDistanceM,
        weekActiveDays,
        monthWorkouts,
        monthTrack,
        monthLift,
        monthDistanceM,
        monthActiveDays,
      });
    } catch (e: any) {
      openError(e?.message ?? "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, [openError]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const trackPct = useMemo(() => {
    if (!stats.allTimeWorkouts) return 0;
    return Math.round((stats.allTimeTrack / stats.allTimeWorkouts) * 100);
  }, [stats.allTimeTrack, stats.allTimeWorkouts]);

  const liftPct = useMemo(() => {
    if (!stats.allTimeWorkouts) return 0;
    return Math.round((stats.allTimeLift / stats.allTimeWorkouts) * 100);
  }, [stats.allTimeLift, stats.allTimeWorkouts]);

  const weekAvgDistanceKm = useMemo(() => {
    if (!stats.weekWorkouts) return 0;
    return stats.weekDistanceM / stats.weekWorkouts / 1000;
  }, [stats.weekDistanceM, stats.weekWorkouts]);

  const monthAvgDistanceKm = useMemo(() => {
    if (!stats.monthWorkouts) return 0;
    return stats.monthDistanceM / stats.monthWorkouts / 1000;
  }, [stats.monthDistanceM, stats.monthWorkouts]);

  function StatCard({
    label,
    value,
    sublabel,
    onPress,
  }: {
    label: string;
    value: string | number;
    sublabel?: string;
    onPress?: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
          borderRadius: 16,
          padding: 14,
          gap: 6,
          minHeight: 96,
        }}
      >
        <Text style={{ color: c.subtext, fontWeight: "700", fontSize: 13 }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "900" }}>{value}</Text>
        {!!sublabel && <Text style={{ color: c.subtext, fontSize: 12 }}>{sublabel}</Text>}
      </Pressable>
    );
  }

  function Section({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 18,
          padding: 16,
          gap: 12,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 17, color: c.text }}>{title}</Text>
        {children}
      </View>
    );
  }

  function QuickLink({
    title,
    subtitle,
    onPress,
  }: {
    title: string;
    subtitle: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
          borderRadius: 14,
          padding: 14,
          gap: 6,
        }}
      >
        <Text style={{ color: c.text, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: c.subtext, fontSize: 12 }}>{subtitle}</Text>
      </Pressable>
    );
  }

  return (
    <FormScreen>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>Overview</Text>
          <Text style={{ color: c.subtext }}>Your training snapshot and recent activity.</Text>
        </View>

        {loading ? (
          <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: c.subtext }}>Loading overview…</Text>
          </View>
        ) : (
          <>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 20,
                padding: 18,
                gap: 12,
              }}
            >
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Training Snapshot</Text>

              <Text style={{ color: c.text, fontSize: 30, fontWeight: "900" }}>
                {stats.allTimeWorkouts} workouts
              </Text>

              <Text style={{ color: c.subtext, fontSize: 15 }}>
                {(stats.allTimeDistanceM / 1000).toFixed(2)} km logged all-time
              </Text>

              <View style={{ marginTop: 4, gap: 8 }}>
                <View
                  style={{
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: c.bg,
                    overflow: "hidden",
                    flexDirection: "row",
                  }}
                >
                  <View
                    style={{
                      width: `${trackPct}%`,
                      height: "100%",
                      backgroundColor: c.primary,
                    }}
                  />
                  <View
                    style={{
                      width: `${liftPct}%`,
                      height: "100%",
                      backgroundColor: c.border,
                    }}
                  />
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.subtext }}>Track {trackPct}%</Text>
                  <Text style={{ color: c.subtext }}>Lift {liftPct}%</Text>
                </View>
              </View>
            </View>

            <Section title="Quick Access">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <QuickLink
                  title="Track Stats"
                  subtitle="Distance, workouts, top exercises"
                  onPress={() => router.push("/profile/track-stats")}
                />
                <QuickLink
                  title="Lift Stats"
                  subtitle="Volume, reps, top exercises"
                  onPress={() => router.push("/profile/lift-stats")}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <QuickLink
                  title="Training Hub"
                  subtitle="Jump into your training tools"
                  onPress={() => router.push("/profile/training-hub")}
                />
                <QuickLink
                  title="Profile"
                  subtitle="Back to your main profile"
                  onPress={() => router.push("/(tabs)/profile")}
                />
              </View>
            </Section>

            <Section title="All-Time">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Total Workouts"
                  value={stats.allTimeWorkouts}
                  sublabel="All logged sessions"
                />
                <StatCard
                  label="Distance Logged"
                  value={`${(stats.allTimeDistanceM / 1000).toFixed(2)} km`}
                  sublabel="Track distance total"
                  onPress={() => router.push("/profile/track-stats")}
                />
              </View>
            </Section>

            <Section title="This Week">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Workouts"
                  value={stats.weekWorkouts}
                  sublabel={`${stats.weekTrack} track • ${stats.weekLift} lift`}
                />
                <StatCard
                  label="Distance"
                  value={`${(stats.weekDistanceM / 1000).toFixed(2)} km`}
                  sublabel="Track distance this week"
                  onPress={() => router.push("/profile/track-stats")}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Active Days"
                  value={stats.weekActiveDays}
                  sublabel="Days with workouts"
                />
                <StatCard
                  label="Avg Distance"
                  value={`${weekAvgDistanceKm.toFixed(2)} km`}
                  sublabel="Per workout"
                />
              </View>
            </Section>

            <Section title="This Month">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Workouts"
                  value={stats.monthWorkouts}
                  sublabel={`${stats.monthTrack} track • ${stats.monthLift} lift`}
                />
                <StatCard
                  label="Distance"
                  value={`${(stats.monthDistanceM / 1000).toFixed(2)} km`}
                  sublabel="Track distance this month"
                  onPress={() => router.push("/profile/track-stats")}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Active Days"
                  value={stats.monthActiveDays}
                  sublabel="Days with workouts"
                />
                <StatCard
                  label="Avg Distance"
                  value={`${monthAvgDistanceKm.toFixed(2)} km`}
                  sublabel="Per workout"
                />
              </View>
            </Section>

            <Section title="Recent Activity">
              {recentWorkouts.length === 0 ? (
                <Text style={{ color: c.subtext }}>No workouts logged yet.</Text>
              ) : (
                recentWorkouts.map((w) => (
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
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>
                        {w.title?.trim() || "Workout"}
                      </Text>
                      <Text style={{ color: c.subtext }}>{prettyDate(w.workout_date)}</Text>
                    </View>

                    <Text style={{ color: c.subtext }}>
                      {w.workout_type === "track" ? "Track" : "Lift"}
                    </Text>

                    {!!w.notes && (
                      <Text numberOfLines={2} style={{ color: c.subtext }}>
                        {w.notes}
                      </Text>
                    )}

                    <Text style={{ color: c.text, fontWeight: "800" }}>View workout →</Text>
                  </Pressable>
                ))
              )}
            </Section>
          </>
        )}
      </View>

      <Modal visible={errorOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.35)",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              padding: 20,
              borderRadius: 16,
              width: "100%",
              maxWidth: 420,
              gap: 12,
            }}
          >
            <Text style={{ fontWeight: "900", fontSize: 18, color: c.text }}>Overview Error</Text>
            <Text style={{ color: c.subtext }}>{errorMessage}</Text>

            <Pressable
              onPress={() => setErrorOpen(false)}
              style={{
                alignSelf: "flex-end",
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: c.primary,
              }}
            >
              <Text style={{ color: c.primaryText, fontWeight: "800" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </FormScreen>
  );
}