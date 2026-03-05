import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

type FriendshipRow = {
  user_low: string;
  user_high: string;
  status: "pending" | "accepted" | "blocked";
};

type WorkoutRow = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: string;
  user_id: string;

  profiles?: {
    id: string;
    username: string | null;
    full_name: string | null;
    school: string | null;
    team: string | null;
  } | null;

  workout_entries?: { id: string }[];
};

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function groupBy<T>(arr: T[], keyFn: (x: T) => string) {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

function formatPrettyDate(ymdStr: string) {
  const d = new Date(ymdStr + "T00:00:00"); // prevent timezone shift
  if (isNaN(d.getTime())) return ymdStr;

  const month = d.toLocaleString(undefined, { month: "long" });
  const dd = d.getDate();
  const year = d.getFullYear();

  function ordinal(n: number) {
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  }

  return `${month} ${ordinal(dd)}, ${year}`;
}

export default function FriendsWorkoutsScreen() {
  const c = useAppColors();

  const [days, setDays] = useState(7);
  const [status, setStatus] = useState("Loading...");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WorkoutRow[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const card = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 12,
      gap: 6,
    }),
    [c]
  );

  const pillBtn = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
    }),
    [c]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("Loading...");

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const myId = userRes.user?.id ?? null;

    if (userErr || !myId) {
      setRows([]);
      setStatus("Not logged in");
      setLoading(false);
      return;
    }

    // ✅ CRITICAL FIX: only friendships involving ME
    // We need:
    // (user_low = myId OR user_high = myId) AND status = 'accepted'
    const { data: fr, error: frErr } = await supabase
      .from("friendships")
      .select("user_low, user_high, status")
      .eq("status", "accepted")
      .or(`user_low.eq.${myId},user_high.eq.${myId}`);

    if (frErr) {
      setRows([]);
      setStatus("Error: " + frErr.message);
      setLoading(false);
      return;
    }

    const friendIds = ((fr ?? []) as FriendshipRow[])
      .map((f) => (f.user_low === myId ? f.user_high : f.user_low))
      .filter(Boolean);

    if (friendIds.length === 0) {
      setRows([]);
      setStatus("No friends yet");
      setLoading(false);
      return;
    }

    // 2) Fetch friends' workouts in last N days
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceYMD = ymd(since);

    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        id,
        workout_date,
        title,
        notes,
        workout_type,
        user_id,
        profiles:profiles!workouts_user_id_profiles_fkey (
          id,
          username,
          full_name,
          school,
          team
        ),
        workout_entries ( id )
      `
      )
      .in("user_id", friendIds)
      .gte("workout_date", sinceYMD)
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      setStatus("Error: " + error.message);
      setLoading(false);
      return;
    }

    const out = (data ?? []) as WorkoutRow[];
    setRows(out);
    setStatus(out.length ? "Loaded ✅" : "No recent workouts");
    setLoading(false);
  }, [days]);

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

  const grouped = useMemo(() => groupBy(rows, (r) => r.workout_date), [rows]);

  const dayKeys = useMemo(() => Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1)), [grouped]);

  const renderWorkout = useCallback(
    (w: WorkoutRow) => {
      const name = w.profiles?.full_name ?? w.profiles?.username ?? "Unknown";
      const handle = w.profiles?.username ? `@${w.profiles.username}` : null;
      const subtitleParts = [handle, w.workout_type].filter(Boolean);
      const subtitle = subtitleParts.join(" • ");
      const entryCount = w.workout_entries?.length ?? 0;

      return (
        <Pressable
          key={w.id}
          onPress={() => {
            router.push(`/friends/workouts/${w.id}`);
          }}
          style={card}
        >
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>{w.title}</Text>

          <Text style={{ color: c.subtext }}>
            {name}
            {subtitle ? ` • ${subtitle}` : ""}
          </Text>

          <Text style={{ color: c.subtext }}>
            {formatPrettyDate(w.workout_date)} • {entryCount} entr{entryCount === 1 ? "y" : "ies"}
          </Text>

          {!!w.notes && <Text style={{ color: c.text, marginTop: 4 }}>{w.notes}</Text>}
        </Pressable>
      );
    },
    [c, card]
  );

  return (
    <FormScreen
    refreshControlProps={{
      refreshing,
      onRefresh,
    }}
    >
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Friends Workouts</Text>
      <Text style={{ color: c.subtext, marginTop: 4 }}>{status}</Text>

      {/* Range selector */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        {[3, 7, 14].map((d) => {
          const active = d === days;
          return (
            <Pressable
              key={d}
              onPress={() => setDays(d)}
              style={{
                ...pillBtn,
                opacity: active ? 1 : 0.75,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "900" }}>{d} days</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Loading friends workouts…</Text>
        </View>
      )}

      {/* Grouped list */}
      <View style={{ marginTop: 14, gap: 14 }}>
        {dayKeys.map((day) => (
          <View key={day} style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>
              {formatPrettyDate(day)}
            </Text>
            {grouped[day].map(renderWorkout)}
          </View>
        ))}
      </View>

      {!loading && rows.length === 0 && (
        <View style={{ marginTop: 14, ...card }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Nothing yet</Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>
            Once your friends log workouts, they’ll show up here.
          </Text>
        </View>
      )}
    </FormScreen>
  );
}