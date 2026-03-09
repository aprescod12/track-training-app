import { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import LeaderboardCard from "../../components/leaderboard/LeaderboardCard";
import {
  PREVIEW_LEADERBOARD_METRICS,
  PreviewLeaderboardMetricKey,
  LeaderboardRow,
  formatPreviewLeaderboardValue,
} from "../../components/leaderboard/types";

type FriendshipRow = {
  id: string;
  user_low: string;
  user_high: string;
  requester_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

type WorkoutSummaryViewRow = {
  user_id: string;
  workout_date: string;
  workout_type: "track" | "lift" | string | null;
  total_sets: number | null;
  distance_m_total: number | string | null;
};

type PreviewLeaderboardData = Record<PreviewLeaderboardMetricKey, LeaderboardRow[]>;

type PreviewAggregate = {
  user_id: string;
  display_name: string;
  total_workouts: number;
  distance_week: number;
  track_workouts: number;
  lift_workouts: number;
  total_sets: number;
};

function emptyLeaderboardData(): PreviewLeaderboardData {
  return {
    total_workouts: [],
    distance_week: [],
    track_workouts: [],
    lift_workouts: [],
    total_sets: [],
  };
}

function startOfWeekMondayYMD() {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function FriendsTab() {
  const c = useAppColors();

  const [myId, setMyId] = useState<string | null>(null);

  const [acceptedCount, setAcceptedCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [leaderboardIndex, setLeaderboardIndex] = useState(0);
  const [leaderboardData, setLeaderboardData] = useState<PreviewLeaderboardData>(
    emptyLeaderboardData()
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    if (userErr || !uid) {
      setMyId(null);
      setAcceptedCount(0);
      setIncomingCount(0);
      setLeaderboardData(emptyLeaderboardData());
      setError("Not logged in");
      setLoading(false);
      return;
    }

    setMyId(uid);

    const { data: friendshipData, error: friendshipErr } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requester_id, status, created_at")
      .order("created_at", { ascending: false });

    if (friendshipErr) {
      setAcceptedCount(0);
      setIncomingCount(0);
      setLeaderboardData(emptyLeaderboardData());
      setError("Error: " + friendshipErr.message);
      setLoading(false);
      return;
    }

    const rows = (friendshipData ?? []) as FriendshipRow[];

    const accepted = rows.filter((r) => r.status === "accepted").length;
    const incoming = rows.filter(
      (r) => r.status === "pending" && r.requester_id !== uid
    ).length;

    setAcceptedCount(accepted);
    setIncomingCount(incoming);

    const friendIds = rows
      .filter((r) => r.status === "accepted")
      .map((r) => {
        if (r.user_low === uid) return r.user_high;
        if (r.user_high === uid) return r.user_low;
        return null;
      })
      .filter(Boolean) as string[];

    const participantIds = Array.from(new Set([uid, ...friendIds]));

    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .in("id", participantIds);

    if (profileErr) {
      setLeaderboardData(emptyLeaderboardData());
      setError("Error: " + profileErr.message);
      setLoading(false);
      return;
    }

    const nameMap = new Map<string, string>();
    ((profileData ?? []) as ProfileRow[]).forEach((p) => {
      const label =
        p.id === uid
          ? "You"
          : p.full_name?.trim() || p.username?.trim() || "Unknown";
      nameMap.set(p.id, label);
    });
    nameMap.set(uid, "You");

    const { data: summaryData, error: summaryErr } = await supabase
      .from("workout_summary_v")
      .select("user_id, workout_date, workout_type, total_sets, distance_m_total")
      .in("user_id", participantIds);

    if (summaryErr) {
      setLeaderboardData(emptyLeaderboardData());
      setError("Error: " + summaryErr.message);
      setLoading(false);
      return;
    }

    const weekStart = startOfWeekMondayYMD();

    const aggregateMap = new Map<string, PreviewAggregate>();
    participantIds.forEach((userId) => {
      aggregateMap.set(userId, {
        user_id: userId,
        display_name: nameMap.get(userId) ?? "Unknown",
        total_workouts: 0,
        distance_week: 0,
        track_workouts: 0,
        lift_workouts: 0,
        total_sets: 0,
      });
    });

    ((summaryData ?? []) as WorkoutSummaryViewRow[]).forEach((row) => {
      const agg = aggregateMap.get(row.user_id);
      if (!agg) return;

      agg.total_workouts += 1;
      agg.total_sets += Number(row.total_sets ?? 0);

      if (row.workout_type === "track") agg.track_workouts += 1;
      if (row.workout_type === "lift") agg.lift_workouts += 1;

      if (row.workout_date >= weekStart) {
        agg.distance_week += Number(row.distance_m_total ?? 0);
      }
    });

    const allAggs = Array.from(aggregateMap.values());

    function makeRows(key: PreviewLeaderboardMetricKey): LeaderboardRow[] {
      return allAggs
        .map((a) => ({
          user_id: a.user_id,
          display_name: a.display_name,
          value: a[key],
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value);
    }

    setLeaderboardData({
      total_workouts: makeRows("total_workouts"),
      distance_week: makeRows("distance_week"),
      track_workouts: makeRows("track_workouts"),
      lift_workouts: makeRows("lift_workouts"),
      total_sets: makeRows("total_sets"),
    });

    setError(null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const id = setInterval(() => {
      setLeaderboardIndex(
        (prev) => (prev + 1) % PREVIEW_LEADERBOARD_METRICS.length
      );
    }, 6000); // slower cycle

    return () => clearInterval(id);
  }, []);

  const pill = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
    }),
    [c]
  );

  const button = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    }),
    [c]
  );

  const activeMetric = PREVIEW_LEADERBOARD_METRICS[leaderboardIndex];
  const activeRows = leaderboardData[activeMetric.key] ?? [];

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
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
        Friends
      </Text>
      
      {error && (
        <Text style={{ color: "#ef4444", marginTop: 4, fontWeight: "600" }}>
          {error}
        </Text>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Pressable
          onPress={() => router.push("/friends/list")}
          style={{ ...pill, flex: 1 }}
        >
          <Text style={{ color: c.subtext, fontSize: 12 }}>Friends</Text>
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 22 }}>
            {acceptedCount}
          </Text>
          <Text style={{ color: c.subtext, marginTop: 2, fontSize: 12 }}>
            Tap to view
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/friends/requests")}
          style={{ ...pill, flex: 1 }}
        >
          <Text style={{ color: c.subtext, fontSize: 12 }}>Requests</Text>
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 22 }}>
            {incomingCount}
          </Text>
          <Text style={{ color: c.subtext, marginTop: 2, fontSize: 12 }}>
            Tap to view
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push("/leaderboard")} style={{ marginTop: 14 }}>
        <View pointerEvents="none">
          <LeaderboardCard
            title={activeMetric.label}
            rows={activeRows}
            formatValue={(value) =>
              formatPreviewLeaderboardValue(activeMetric.key, value)
            }
            compact
            maxRows={6}
            scrollHeight={220}
          />
        </View>

        <View
          style={{
            position: "absolute",
            top: 14,
            right: 14,
          }}
          pointerEvents="none"
        >
          <Text style={{ color: c.subtext, fontSize: 12, fontWeight: "700" }}>
            View all →
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            marginTop: 10,
          }}
          pointerEvents="none"
        >
          {PREVIEW_LEADERBOARD_METRICS.map((metric, i) => {
            const active = i === leaderboardIndex;
            return (
              <View
                key={metric.key}
                style={{
                  width: active ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: active ? c.text : c.border,
                }}
              />
            );
          })}
        </View>
      </Pressable>

      <View style={{ gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => router.push("/friends/add")} style={button}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Add Friends</Text>
          <Text style={{ color: c.subtext, marginTop: 2, fontSize: 12 }}>
            Search by username or name
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/friends/feed")}
            style={{ ...button, flex: 1 }}
          >
            <Text style={{ color: c.text, fontWeight: "800" }}>Feed</Text>
            <Text style={{ color: c.subtext, marginTop: 2, fontSize: 12 }}>
              PRs & streaks
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/friends/workouts")}
            style={{ ...button, flex: 1 }}
          >
            <Text style={{ color: c.text, fontWeight: "800" }}>Workouts</Text>
            <Text style={{ color: c.subtext, marginTop: 2, fontSize: 12 }}>
              Past few days
            </Text>
          </Pressable>
        </View>
      </View>

      {loading && (
        <View
          style={{
            marginTop: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Checking friendships…</Text>
        </View>
      )}

      {!loading && acceptedCount === 0 && (
        <View style={{ marginTop: 14, ...pill }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Get started</Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>
            Add friends to see their recent workouts and achievements.
          </Text>
        </View>
      )}
    </FormScreen>
  );
}