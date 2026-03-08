import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import Avatar from "../../components/Avatar";

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
  school: string | null;
  team: string | null;
  avatar_url: string | null;
};

type FriendListRow = {
  friendshipId: string;
  friendId: string;
  profile: ProfileRow | null;
};

export default function FriendsListScreen() {
  const c = useAppColors();

  const [rows, setRows] = useState<FriendListRow[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [confirmUnfriend, setConfirmUnfriend] = useState<{
    open: boolean;
    friendshipId: string | null;
    name: string;
  }>({
    open: false,
    friendshipId: null,
    name: "",
  });

  const card = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 12,
      gap: 8,
    }),
    [c]
  );

  const button = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
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

    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requester_id, status, created_at")
      .eq("status", "accepted")
      .or(`user_low.eq.${myId},user_high.eq.${myId}`)
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      setStatus("Error: " + error.message);
      setLoading(false);
      return;
    }

    const friendships = (data ?? []) as FriendshipRow[];
    const friendIds = friendships.map((f) => (f.user_low === myId ? f.user_high : f.user_low));

    if (friendIds.length === 0) {
      setRows([]);
      setStatus("No friends yet");
      setLoading(false);
      return;
    }

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, username, school, team, avatar_url")
      .in("id", friendIds);

    if (pErr) {
      setRows([]);
      setStatus("Error: " + pErr.message);
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, ProfileRow>();
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }

    const nextRows: FriendListRow[] = friendships.map((f) => {
      const friendId = f.user_low === myId ? f.user_high : f.user_low;
      return {
        friendshipId: f.id,
        friendId,
        profile: profileMap.get(friendId) ?? null,
      };
    });

    setRows(nextRows);
    setStatus(nextRows.length ? "Loaded ✅" : "No friends yet");
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function confirmDeleteFriendship() {
    const friendshipId = confirmUnfriend.friendshipId;
    if (!friendshipId) return;

    try {
      setBusyId(friendshipId);
      setConfirmUnfriend({ open: false, friendshipId: null, name: "" });

      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);

      if (error) {
        setStatus("Error: " + error.message);
        return;
      }

      setRows((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
      setStatus("Loaded ✅");
    } finally {
      setBusyId(null);
    }
  }

  function handleUnfriend(row: FriendListRow) {
    const displayName = row.profile?.full_name ?? row.profile?.username ?? "this friend";

    setConfirmUnfriend({
      open: true,
      friendshipId: row.friendshipId,
      name: displayName,
    });
  }

  return (
    <>
      <FormScreen>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Friends</Text>

          <Pressable onPress={() => router.back()} style={button}>
            <Text style={{ color: c.text, fontWeight: "700" }}>Back</Text>
          </Pressable>
        </View>

        <Text style={{ color: c.subtext, marginTop: 4 }}>{status}</Text>

        {loading && (
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: c.subtext }}>Loading friends…</Text>
          </View>
        )}

        <View style={{ marginTop: 14, gap: 10 }}>
          {rows.map((row) => {
            const p = row.profile;
            const displayName = p?.full_name ?? "Unknown";
            const username = p?.username ? `@${p.username}` : null;

            return (
              <View key={row.friendshipId} style={card}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/friends/[friendId]",
                      params: { friendId: row.friendId },
                    })
                  }
                  style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
                >
                  <Avatar uri={p?.avatar_url} name={displayName} size={52} />

                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>{displayName}</Text>

                    {!!username && <Text style={{ color: c.subtext }}>{username}</Text>}
                    {!!p?.school && <Text style={{ color: c.subtext }}>{p.school}</Text>}
                    {!!p?.team && <Text style={{ color: c.subtext }}>{p.team}</Text>}

                    <Text style={{ color: c.subtext, marginTop: 2 }}>Tap to view profile</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => handleUnfriend(row)}
                  disabled={busyId === row.friendshipId}
                  style={{
                    ...button,
                    opacity: busyId === row.friendshipId ? 0.6 : 1,
                  }}
                >
                  {busyId === row.friendshipId ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: c.text, fontWeight: "700" }}>Unfriend</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {!loading && rows.length === 0 && (
          <View style={{ marginTop: 14, ...card }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>No friends yet</Text>
            <Text style={{ color: c.subtext, marginTop: 6 }}>
              Add friends to view their profiles, workouts, and achievements.
            </Text>
          </View>
        )}
      </FormScreen>

      <Modal visible={confirmUnfriend.open} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.35)",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              padding: 18,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>Unfriend</Text>

            <Text style={{ color: c.subtext }}>
              Remove {confirmUnfriend.name} from your friends list?
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() =>
                  setConfirmUnfriend({
                    open: false,
                    friendshipId: null,
                    name: "",
                  })
                }
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ color: c.text, fontWeight: "700" }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={confirmDeleteFriendship}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: "#ff3b30",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Unfriend</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}