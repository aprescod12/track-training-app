import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

type FriendshipRow = {
  id: string;
  user_low: string;
  user_high: string;
  requester_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

export default function FriendsTab() {
  const c = useAppColors();

  const [myId, setMyId] = useState<string | null>(null);

  const [acceptedCount, setAcceptedCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);

  const [status, setStatus] = useState("Loading...");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("Loading...");

    // 1) Get my id
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    if (userErr || !uid) {
      setMyId(null);
      setAcceptedCount(0);
      setIncomingCount(0);
      setStatus("Not logged in");
      setLoading(false);
      return;
    }

    setMyId(uid);

    // 2) Fetch friendships where I'm a participant (RLS should allow this)
    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requester_id, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setAcceptedCount(0);
      setIncomingCount(0);
      setStatus("Error: " + error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as FriendshipRow[];

    const accepted = rows.filter((r) => r.status === "accepted").length;

    // Incoming = pending requests where I'm NOT the requester
    const incoming = rows.filter(
      (r) => r.status === "pending" && r.requester_id !== uid
    ).length;

    setAcceptedCount(accepted);
    setIncomingCount(incoming);

    setStatus(accepted ? "Loaded ✅" : "No friends yet");
    setLoading(false);
  }, []);

  // Reload when tab is focused (better than useEffect for tabs)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Friends</Text>
      <Text style={{ color: c.subtext, marginTop: 4 }}>{status}</Text>

      {/* Summary */}
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

      {/* Actions */}
      <View style={{ gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => router.push("/friends/add")} style={button}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Add Friends</Text>
          <Text style={{ color: c.subtext, marginTop: 2, fontSize: 12 }}>
            Search by username or name
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => router.push("/friends/feed")} style={{ ...button, flex: 1 }}>
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

      {/* Loading indicator */}
      {loading && (
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Checking friendships…</Text>
        </View>
      )}

      {/* Small hint */}
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