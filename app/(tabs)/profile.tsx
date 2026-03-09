import { Text, Pressable, ActivityIndicator, Alert, View } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { router, useFocusEffect } from "expo-router";
import { getMyProfile, Profile } from "../../lib/profile";
import Avatar from "../../components/Avatar";

export default function ProfileScreen() {
  const c = useAppColors();

  const [status, setStatus] = useState("Loading...");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [stats, setStats] = useState({
    totalWorkouts: 0,
    trackWorkouts: 0,
    liftWorkouts: 0,
    totalDistanceM: 0,
    totalLiftSets: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  async function loadProfile() {
    try {
      setLoadingProfile(true);
      const p = await getMyProfile();
      setProfile(p);
    } catch (e: any) {
      Alert.alert("Profile error", e?.message ?? "Failed to load profile");
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadStats() {
    try {
      setLoadingStats(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (userErr || !uid) {
        setStats({
          totalWorkouts: 0,
          trackWorkouts: 0,
          liftWorkouts: 0,
          totalDistanceM: 0,
          totalLiftSets: 0,
        });
        setStatus("Not logged in");
        return;
      }

      const { data: workoutRows, error: workoutErr } = await supabase
        .from("workouts")
        .select("id, workout_type")
        .eq("user_id", uid);

      if (workoutErr) throw workoutErr;

      const totalWorkouts = workoutRows?.length ?? 0;
      const trackWorkouts = (workoutRows ?? []).filter((w) => w.workout_type === "track").length;
      const liftWorkouts = (workoutRows ?? []).filter((w) => w.workout_type === "lift").length;

      const { data: distRows, error: distErr } = await supabase
        .from("workout_entries")
        .select(`
          reps,
          sets,
          exercises(distance_m),
          workouts!inner(user_id, workout_type)
        `)
        .eq("user_id", uid)
        .eq("workouts.user_id", uid);

      if (distErr) throw distErr;

      const totalDistanceM = (distRows ?? []).reduce((sum: number, r: any) => {
        if (r.workouts?.workout_type !== "track") return sum;
        const perRep = Number(r.exercises?.distance_m ?? 0);
        const reps = Number(r.reps ?? 1);
        const sets = Number(r.sets ?? 1);
        return sum + perRep * reps * sets;
      }, 0);

      const totalLiftSets = (distRows ?? []).reduce((sum: number, r: any) => {
        if (r.workouts?.workout_type !== "lift") return sum;
        return sum + Number(r.sets ?? 0);
      }, 0);

      setStats({
        totalWorkouts,
        trackWorkouts,
        liftWorkouts,
        totalDistanceM,
        totalLiftSets,
      });

      setStatus("Up to date");
    } catch (e: any) {
      Alert.alert("Stats error", e?.message ?? "Failed to load stats");
      setStats({
        totalWorkouts: 0,
        trackWorkouts: 0,
        liftWorkouts: 0,
        totalDistanceM: 0,
        totalLiftSets: 0,
      });
      setStatus("Failed to load");
    } finally {
      setLoadingStats(false);
    }
  }

  const loadAll = useCallback(async () => {
    await Promise.all([loadProfile(), loadStats()]);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  function StatTile({
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
          minHeight: 96,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
          borderRadius: 16,
          padding: 14,
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: c.subtext, fontSize: 13, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "900" }}>{value}</Text>
        {!!sublabel && <Text style={{ color: c.subtext, fontSize: 12 }}>{sublabel}</Text>}
      </Pressable>
    );
  }

  return (
    <FormScreen>
      <View style={{ gap: 14 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>Profile</Text>
          <Text style={{ color: c.subtext, marginTop: 4 }}>{status}</Text>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 18,
            padding: 16,
            gap: 14,
          }}
        >
          {loadingProfile ? (
            <ActivityIndicator />
          ) : !profile ? (
            <Text style={{ color: c.subtext, fontSize: 16 }}>No profile found.</Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <Avatar
                  uri={(profile as any).avatar_url ?? null}
                  name={profile.full_name ?? (profile as any).username ?? "User"}
                  size={80}
                />

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 22, fontWeight: "900", color: c.text }}>
                    {profile.full_name || "Unnamed Athlete"}
                  </Text>

                  {!!(profile as any).username && (
                    <Text style={{ color: c.subtext, fontSize: 15 }}>@{(profile as any).username}</Text>
                  )}

                  <Text style={{ color: c.subtext }}>{profile.role ?? "Athlete"}</Text>

                  {!!profile.school && <Text style={{ color: c.subtext }}>{profile.school}</Text>}

                  {!!profile.team && <Text style={{ color: c.subtext }}>{profile.team}</Text>}

                  {!!profile.grad_year && (
                    <Text style={{ color: c.subtext }}>Class of {profile.grad_year}</Text>
                  )}
                </View>
              </View>

              {!!(profile as any).bio && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: c.text, fontWeight: "800", marginBottom: 6 }}>About</Text>
                  <Text style={{ color: c.subtext, lineHeight: 20 }}>{(profile as any).bio}</Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => router.push("/profile-edit")}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: c.primary,
                  }}
                >
                  <Text style={{ textAlign: "center", color: c.primaryText, fontWeight: "800" }}>
                    Edit Profile
                  </Text>
                </Pressable>

                <Pressable
                  onPress={loadAll}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                  }}
                >
                  <Text style={{ textAlign: "center", color: c.text, fontWeight: "800" }}>
                    Refresh
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

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
          <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Overview</Text>

          {loadingStats ? (
            <ActivityIndicator />
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatTile
                label="Total Workouts"
                value={stats.totalWorkouts}
                sublabel="All logged sessions"
                onPress={() => router.push("/profile/overview")}
              />
              <StatTile
                label="Distance Logged"
                value={`${(stats.totalDistanceM / 1000).toFixed(2)} km`}
                sublabel="Track distance total"
                onPress={() => router.push("/profile/overview")}
              />
            </View>
          )}
        </View>

        <Pressable
          onPress={() => router.push("/profile/training-hub")}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 18,
            padding: 16,
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Training Hub</Text>
          <Text style={{ color: c.subtext }}>Open your training tools, stats, and schedule.</Text>
          <Text style={{ color: c.text, fontWeight: "800", marginTop: 2 }}>Open →</Text>
        </Pressable>

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
          <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Performance</Text>

          {loadingStats ? (
            <ActivityIndicator />
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatTile
                label="Track Focus"
                value={stats.trackWorkouts}
                sublabel={
                  stats.totalWorkouts > 0
                    ? `${Math.round((stats.trackWorkouts / stats.totalWorkouts) * 100)}% of workouts`
                    : "No workouts yet"
                }
                onPress={() => router.push("/profile/track-stats")}
              />
              <StatTile
                label="Lift Focus"
                value={stats.liftWorkouts}
                sublabel={
                  stats.totalWorkouts > 0
                    ? `${Math.round((stats.liftWorkouts / stats.totalWorkouts) * 100)}% of workouts`
                    : "No workouts yet"
                }
                onPress={() => router.push("/profile/lift-stats")}
              />
            </View>
          )}
        </View>

        <Pressable
          onPress={handleLogout}
          style={{
            paddingVertical: 13,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
          }}
        >
          <Text style={{ textAlign: "center", color: c.text, fontWeight: "800" }}>
            Log Out
          </Text>
        </Pressable>
      </View>
    </FormScreen>
  );
}