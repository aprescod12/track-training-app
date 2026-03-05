import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  school: string | null;
  team: string | null;
  avatar_url: string | null;
};

type FriendshipRow = {
  id: string;
  user_low: string;
  user_high: string;
  requester_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

function canonicalPair(a: string, b: string) {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}

export default function AddFriendsScreen() {
  const c = useAppColors();

  const [myId, setMyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileRow[]>([]);
  const [status, setStatus] = useState("Search by username or full name");
  const [loading, setLoading] = useState(false);

  // friendshipByOtherId helps you label buttons (Friends / Requested / Add)
  const [friendshipByOtherId, setFriendshipByOtherId] = useState<
    Record<string, FriendshipRow>
  >({});

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

  const inputStyle = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 16,
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
    }),
    [c]
  );

  const loadMyIdAndFriendships = useCallback(async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;
    setMyId(uid);

    if (!uid) return;

    // Get all friendships where I’m a participant (RLS policy should allow)
    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requester_id, status, created_at");

    if (error) return;

    const map: Record<string, FriendshipRow> = {};
    ((data ?? []) as FriendshipRow[]).forEach((f) => {
      const otherId = f.user_low === uid ? f.user_high : f.user_low;
      map[otherId] = f;
    });

    setFriendshipByOtherId(map);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyIdAndFriendships();
    }, [loadMyIdAndFriendships])
  );

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setStatus("Search by username or full name");
      return;
    }

    setLoading(true);
    setStatus("Searching...");

    // NOTE: this requires profiles SELECT policy that allows reading for search
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, school, team, avatar_url")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(25);

    if (error) {
      setResults([]);
      setStatus("Error: " + error.message);
      setLoading(false);
      return;
    }

    const filtered = ((data ?? []) as ProfileRow[]).filter((p) => p.id !== myId);
    setResults(filtered);
    setStatus(filtered.length ? "Results" : "No matches");
    setLoading(false);
  }, [query, myId]);

  const sendRequest = useCallback(
    async (otherId: string) => {
      if (!myId) {
        Alert.alert("Not logged in", "Please sign in first.");
        return;
      }

      const existing = friendshipByOtherId[otherId];
      if (existing?.status === "accepted") return;
      if (existing?.status === "pending") return;

      const { user_low, user_high } = canonicalPair(myId, otherId);

      const { error } = await supabase.from("friendships").insert({
        user_low,
        user_high,
        requester_id: myId,
        status: "pending",
      });

      if (error) {
        // Unique violation -> request already exists
        if ((error as any).code === "23505") {
          Alert.alert("Already requested", "A request already exists for this person.");
        } else {
          Alert.alert("Error", error.message);
        }
        return;
      }

      await loadMyIdAndFriendships();
      Alert.alert("Request sent", "They’ll see it in their Requests tab.");
    },
    [myId, friendshipByOtherId, loadMyIdAndFriendships]
  );

  const labelFor = useCallback(
    (p: ProfileRow) => {
      const f = friendshipByOtherId[p.id];
      if (!f) return "Add";
      if (f.status === "accepted") return "Friends";
      if (f.status === "pending") {
        // If I requested it
        if (f.requester_id === myId) return "Requested";
        // They requested me
        return "Respond";
      }
      if (f.status === "blocked") return "Blocked";
      return "Add";
    },
    [friendshipByOtherId, myId]
  );

  const onPressRow = useCallback(
    async (p: ProfileRow) => {
      const f = friendshipByOtherId[p.id];
      if (f?.status === "pending" && f.requester_id !== myId) {
        Alert.alert("Request pending", "They already requested you. Go to Requests to accept.");
        return;
      }
      if (f?.status === "accepted") return;
      if (f?.status === "pending") return;
      if (f?.status === "blocked") return;

      await sendRequest(p.id);
    },
    [friendshipByOtherId, myId, sendRequest]
  );

  return (
    <FormScreen>
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Add Friends</Text>
      <Text style={{ color: c.subtext, marginTop: 4 }}>{status}</Text>

      <View style={{ marginTop: 12, gap: 10 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search username or name"
          placeholderTextColor={c.subtext}
          autoCapitalize="none"
          style={inputStyle}
          returnKeyType="search"
          onSubmitEditing={search}
        />

        <Pressable onPress={search} style={btn}>
          <Text style={{ color: c.text, fontWeight: "900" }}>Search</Text>
        </Pressable>

        {loading && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: c.subtext }}>Searching…</Text>
          </View>
        )}

        <View style={{ gap: 10 }}>
          {results.map((p) => {
            const handle = p.username ? `@${p.username}` : null;
            const subtitle = [p.school, p.team].filter(Boolean).join(" • ");
            const label = labelFor(p);

            const disabled = label === "Friends" || label === "Requested" || label === "Blocked";

            return (
              <View key={p.id} style={card}>
                <View style={{ gap: 2 }}>
                  <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>
                    {p.full_name ?? "Unknown"}
                  </Text>
                  {!!handle && <Text style={{ color: c.subtext }}>{handle}</Text>}
                  {!!subtitle && <Text style={{ color: c.subtext }}>{subtitle}</Text>}
                </View>

                <Pressable
                  onPress={() => onPressRow(p)}
                  disabled={disabled}
                  style={{ ...btn, marginTop: 8, opacity: disabled ? 0.6 : 1 }}
                >
                  <Text style={{ color: c.text, fontWeight: "900" }}>{label}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </FormScreen>
  );
}