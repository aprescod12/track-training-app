import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal } from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import Avatar from "../../components/Avatar";

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
  school: string | null;
  team: string | null;
  grad_year: number | null;
  events: string[] | null;
  bio: string | null;
  avatar_url: string | null;
};

type FriendshipRow = {
  id: string;
  user_low: string;
  user_high: string;
  status: "pending" | "accepted" | "blocked";
};

export default function FriendProfileScreen() {
  const c = useAppColors();

  const params = useLocalSearchParams<{ friendId?: string | string[] }>();
  const friendId =
    typeof params.friendId === "string"
      ? params.friendId
      : Array.isArray(params.friendId)
      ? params.friendId[0]
      : undefined;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalDistanceM: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [unfriending, setUnfriending] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

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
    if (!friendId) {
      setProfile(null);
      setError("Missing friend id");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        username,
        role,
        school,
        team,
        grad_year,
        events,
        bio,
        avatar_url
      `)
      .eq("id", friendId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setError("Error: " + error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setProfile(null);
      setError("Profile not found");
      setLoading(false);
      return;
    }

    setProfile(data as ProfileRow);
    setLoading(false);
  }, [friendId]);

  const loadStats = useCallback(async () => {
    if (!friendId) {
      setStats({ totalWorkouts: 0, totalDistanceM: 0 });
      setLoadingStats(false);
      return;
    }

    try {
      setLoadingStats(true);

      const { count: workoutCount, error: countErr } = await supabase
        .from("workouts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", friendId);

      if (countErr) throw countErr;

      const { data: distRows, error: distErr } = await supabase
        .from("workout_entries")
        .select(`
          reps,
          sets,
          exercises(distance_m),
          workouts!inner(user_id, workout_type)
        `)
        .eq("user_id", friendId)
        .eq("workouts.user_id", friendId);

      if (distErr) throw distErr;

      const totalDistanceM = (distRows ?? []).reduce((sum: number, r: any) => {
        if (r.workouts?.workout_type !== "track") return sum;
        const perRep = Number(r.exercises?.distance_m ?? 0);
        const reps = Number(r.reps ?? 1);
        const sets = Number(r.sets ?? 1);
        return sum + perRep * reps * sets;
      }, 0);

      setStats({
        totalWorkouts: workoutCount ?? 0,
        totalDistanceM,
      });
    } catch {
      setStats({ totalWorkouts: 0, totalDistanceM: 0 });
    } finally {
      setLoadingStats(false);
    }
  }, [friendId]);

  const loadFriendship = useCallback(async () => {
    if (!friendId) {
      setFriendshipId(null);
      return;
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const myId = userRes.user?.id ?? null;

    if (userErr || !myId) {
      setFriendshipId(null);
      return;
    }

    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, status")
      .eq("status", "accepted")
      .or(`and(user_low.eq.${myId},user_high.eq.${friendId}),and(user_low.eq.${friendId},user_high.eq.${myId})`)
      .maybeSingle();

    if (error) {
      setFriendshipId(null);
      return;
    }

    const row = data as FriendshipRow | null;
    setFriendshipId(row?.id ?? null);
  }, [friendId]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadStats();
      loadFriendship();
    }, [load, loadStats, loadFriendship])
  );

  async function confirmUnfriend() {
    if (!friendshipId) return;

    try {
      setUnfriending(true);
      setConfirmOpen(false);

      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);

      if (error) {
        setError("Error: " + error.message);
        return;
      }

      router.replace("/friends/list");
    } finally {
      setUnfriending(false);
    }
  }

  return (
    <>
      <FormScreen>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Friend Profile</Text>

          <Pressable onPress={() => router.back()} style={button}>
            <Text style={{ color: c.text, fontWeight: "700" }}>Back</Text>
          </Pressable>
        </View>

        {error && (
  <Text style={{ color: "red", fontWeight: "600" }}>
    {error}
  </Text>
)}

        {loading && (
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: c.subtext }}>Loading profile…</Text>
          </View>
        )}

        {profile && (
          <View style={{ marginTop: 14, gap: 10 }}>
            <View style={card}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Avatar uri={profile.avatar_url} name={profile.full_name ?? profile.username} size={72} />

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: c.text, fontWeight: "900", fontSize: 20 }}>
                    {profile.full_name ?? "Unnamed"}
                  </Text>

                  {!!profile.username && <Text style={{ color: c.subtext }}>@{profile.username}</Text>}
                  <Text style={{ color: c.subtext }}>Role: {profile.role ?? "athlete"}</Text>

                  {!!profile.school && <Text style={{ color: c.subtext }}>School: {profile.school}</Text>}
                  {!!profile.team && <Text style={{ color: c.subtext }}>Team: {profile.team}</Text>}
                  {!!profile.grad_year && <Text style={{ color: c.subtext }}>Grad Year: {profile.grad_year}</Text>}
                </View>
              </View>
            </View>

            <View style={card}>
              <Text style={{ color: c.text, fontWeight: "800" }}>Stats</Text>

              {loadingStats ? (
                <ActivityIndicator />
              ) : (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      padding: 12,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: c.subtext }}>Total Workouts</Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: c.text }}>
                      {stats.totalWorkouts}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      padding: 12,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: c.subtext }}>Total Distance</Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: c.text }}>
                      {(stats.totalDistanceM / 1000).toFixed(2)} km
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {!!profile.events?.length && (
              <View style={card}>
                <Text style={{ color: c.text, fontWeight: "800" }}>Events</Text>
                <Text style={{ color: c.subtext }}>{profile.events.join(" • ")}</Text>
              </View>
            )}

            {!!profile.bio && (
              <View style={card}>
                <Text style={{ color: c.text, fontWeight: "800" }}>Bio</Text>
                <Text style={{ color: c.subtext }}>{profile.bio}</Text>
              </View>
            )}

            {friendshipId ? (
              <Pressable
                onPress={() => setConfirmOpen(true)}
                disabled={unfriending}
                style={{
                  ...button,
                  opacity: unfriending ? 0.6 : 1,
                }}
              >
                {unfriending ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: c.text, fontWeight: "700" }}>Unfriend</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )}

        {!loading && !profile && (
          <View style={{ marginTop: 14, ...card }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>Could not load profile</Text>
            <Text style={{ color: c.subtext, marginTop: 6 }}>
              This profile may not exist or may not be visible.
            </Text>
          </View>
        )}
      </FormScreen>

      <Modal visible={confirmOpen} transparent animationType="fade">
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
              Remove {profile?.full_name ?? profile?.username ?? "this friend"} from your friends list?
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() => setConfirmOpen(false)}
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
                onPress={confirmUnfriend}
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