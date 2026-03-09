import { useCallback, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import Avatar from "../../components/Avatar";

type FriendshipRow = {
  user_low: string;
  user_high: string;
  status: "pending" | "accepted" | "blocked";
};

type AchievementRow = {
  id: string;
  user_id: string;
  type: string;
  workout_id: string | null;
  exercise_id: string | null;
  value_num: number | null;
  value_text: string | null;
  meta: Record<string, any> | null;
  created_at: string;
  exercises?: {
    name: string | null;
  }[] | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function formatPrettyDateTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function firstName(fullName: string | null | undefined, username: string | null | undefined) {
  const t = (fullName ?? "").trim();
  if (t) return t.split(/\s+/)[0];
  return username ?? "Someone";
}

export default function FriendsFeedScreen() {
  const c = useAppColors();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const myId = userRes.user?.id ?? null;

    if (userErr || !myId) {
      setRows([]);
      setProfilesById({});
      setError("Not logged in");
      setLoading(false);
      return;
    }

    const { data: fr, error: frErr } = await supabase
      .from("friendships")
      .select("user_low, user_high, status")
      .eq("status", "accepted")
      .or(`user_low.eq.${myId},user_high.eq.${myId}`);

    if (frErr) {
      setRows([]);
      setProfilesById({});
      setError("Error: " + frErr.message);
      setLoading(false);
      return;
    }

    const friendIds = ((fr ?? []) as FriendshipRow[])
      .map((f) => (f.user_low === myId ? f.user_high : f.user_low))
      .filter(Boolean);

    if (friendIds.length === 0) {
      setRows([]);
      setProfilesById({});
      setError("No friends yet");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("achievements")
      .select(
        `
        id,
        user_id,
        type,
        workout_id,
        exercise_id,
        value_num,
        value_text,
        meta,
        created_at,
        exercises (
          name
        )
      `
      )
      .in("user_id", friendIds)
      .in("type", [
        "pr_time",
        "pr_weight",
        "workout_streak",
        "weekly_workout_count",
        "distance_milestone",
        "comeback",
      ])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setRows([]);
      setProfilesById({});
      setError("Error: " + error.message);
      setLoading(false);
      return;
    }

    const achRows = (data ?? []) as AchievementRow[];
    setRows(achRows);

    const uniqueUserIds = Array.from(new Set(achRows.map((r) => r.user_id).filter(Boolean)));

    if (uniqueUserIds.length) {
      const { data: profileRows, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", uniqueUserIds);

      if (pErr) {
        setProfilesById({});
        setLoading(false);
        return;
      }

      const map: Record<string, ProfileRow> = {};
      for (const p of (profileRows ?? []) as ProfileRow[]) {
        map[p.id] = p;
      }
      setProfilesById(map);
    } else {
      setProfilesById({});
    }

    setLoading(false);
  }, []);

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
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Friends Feed</Text>
      
      {error && (
        <Text style={{ color: "#ef4444", fontWeight: "600" }}>
            {error}
        </Text>
       )}

      {loading && (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Loading feed…</Text>
        </View>
      )}

      <View style={{ marginTop: 14, gap: 10 }}>
        {rows.map((row) => {
          const p = profilesById[row.user_id];
          const name = firstName(p?.full_name, p?.username);
          const exerciseName = row.exercises?.[0]?.name ?? "exercise";

          let headline = "";
          let subtext = row.value_text ?? "";

          if (row.type === "pr_time") {
            headline = `🏆 ${name} set a new PR in ${exerciseName}`;
          } else if (row.type === "pr_weight") {
            headline = `🏋️ ${name} hit a new PR in ${exerciseName}`;
          } else if (row.type === "workout_streak") {
            headline = `🔥 ${name} hit a workout streak`;
            subtext = row.value_text ?? `${row.value_num ?? ""} workouts in a row`;
          } else if (row.type === "weekly_workout_count") {
            headline = `📅 ${name} hit a weekly workout milestone`;
            subtext = row.value_text ?? `${row.value_num ?? ""} workouts this week`;
          } else if (row.type === "distance_milestone") {
            headline = `🏃 ${name} hit a distance milestone`;
            subtext = row.value_text ?? "";
          } else if (row.type === "comeback") {
            headline = `👋 ${name} is back`;
            subtext = row.value_text ?? "";
          } else {
            headline = `${name} unlocked an achievement`;
          }

          return (
            <Pressable
              key={row.id}
              onPress={() =>
                router.push({
                  pathname: "/friends/[friendId]",
                  params: { friendId: row.user_id },
                })
              }
              style={({ pressed }) => [
                card,
                { opacity: pressed ? 0.92 : 1 },
              ]}
            >
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Avatar uri={p?.avatar_url} name={p?.full_name ?? p?.username} size={48} />

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>{headline}</Text>

                  {!!subtext && <Text style={{ color: c.text, fontWeight: "700" }}>{subtext}</Text>}

                  <Text style={{ color: c.subtext }}>{formatPrettyDateTime(row.created_at)}</Text>
                  <Text style={{ color: c.subtext, fontSize: 12 }}>Tap to view profile</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!loading && rows.length === 0 && (
        <View style={{ marginTop: 14, ...card }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Nothing yet</Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>
            Once your friends hit milestones, they’ll show up here.
          </Text>
        </View>
      )}
    </FormScreen>
  );
}