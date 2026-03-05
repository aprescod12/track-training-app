import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
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

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  school: string | null;
  team: string | null;
  avatar_url: string | null;
};

export default function FriendRequestsScreen() {
  const c = useAppColors();

  const [myId, setMyId] = useState<string | null>(null);
  const [rows, setRows] = useState<FriendshipRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [status, setStatus] = useState("Loading...");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pill = useMemo(
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

  const btn = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      flex: 1,
    }),
    [c]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("Loading...");

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    if (userErr || !uid) {
      setMyId(null);
      setRows([]);
      setProfilesById({});
      setStatus("Not logged in");
      setLoading(false);
      return;
    }

    setMyId(uid);

    // Fetch all pending where I'm a participant; we'll filter to "incoming"
    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requester_id, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      setProfilesById({});
      setStatus("Error: " + error.message);
      setLoading(false);
      return;
    }

    const allPending = (data ?? []) as FriendshipRow[];

    // Incoming = pending where requester != me
    const incoming = allPending.filter((r) => r.requester_id !== uid);

    setRows(incoming);
    setStatus(incoming.length ? "Loaded ✅" : "No friend requests");

    // Fetch requester profiles in one query
    const requesterIds = Array.from(new Set(incoming.map((r) => r.requester_id)));
    if (requesterIds.length === 0) {
      setProfilesById({});
      setLoading(false);
      return;
    }

    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("id, username, full_name, school, team, avatar_url")
      .in("id", requesterIds);

    if (profErr) {
      // Not fatal; you can still show the request
      setProfilesById({});
      setLoading(false);
      return;
    }

    const map: Record<string, ProfileRow> = {};
    (profs ?? []).forEach((p: any) => (map[p.id] = p));
    setProfilesById(map);

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const accept = useCallback(
    async (friendshipId: string) => {
      setBusyId(friendshipId);
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId);

      if (error) Alert.alert("Error", error.message);
      await load();
      setBusyId(null);
    },
    [load]
  );

  const decline = useCallback(
    async (friendshipId: string) => {
      setBusyId(friendshipId);
      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
      if (error) Alert.alert("Error", error.message);
      await load();
      setBusyId(null);
    },
    [load]
  );

  return (
    <FormScreen>
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Requests</Text>
      <Text style={{ color: c.subtext, marginTop: 4 }}>{status}</Text>

      {loading && (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Loading requests…</Text>
        </View>
      )}

      <View style={{ marginTop: 14, gap: 10 }}>
        {rows.map((r) => {
          const p = profilesById[r.requester_id];
          const name = p?.full_name ?? "Unknown user";
          const handle = p?.username ? `@${p.username}` : null;
          const subtitle = [p?.school, p?.team].filter(Boolean).join(" • ");

          return (
            <View key={r.id} style={pill}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>{name}</Text>
                {!!handle && <Text style={{ color: c.subtext }}>{handle}</Text>}
                {!!subtitle && <Text style={{ color: c.subtext }}>{subtitle}</Text>}
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <Pressable
                  style={btn}
                  disabled={busyId === r.id}
                  onPress={() => accept(r.id)}
                >
                  <Text style={{ color: c.text, fontWeight: "900" }}>
                    {busyId === r.id ? "..." : "Accept"}
                  </Text>
                </Pressable>

                <Pressable
                  style={btn}
                  disabled={busyId === r.id}
                  onPress={() => decline(r.id)}
                >
                  <Text style={{ color: c.text, fontWeight: "900" }}>
                    {busyId === r.id ? "..." : "Decline"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {!loading && rows.length === 0 && (
        <View style={{ marginTop: 14, ...pill }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>All clear</Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>
            When someone adds you, their request will show up here.
          </Text>
        </View>
      )}
    </FormScreen>
  );
}