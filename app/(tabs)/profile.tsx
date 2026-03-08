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
    totalDistanceM: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  async function runDiagnostics() {
    const urlOk = !!process.env.EXPO_PUBLIC_SUPABASE_URL;
    const keyOk = !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    setStatus(
      `ENV URL: ${urlOk ? "OK" : "MISSING"}\nENV KEY: ${
        keyOk ? "OK" : "MISSING"
      }\nChecking session...`
    );

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setStatus(`Supabase error:\n${error.message}`);
        return;
      }
      setStatus(`Supabase OK ✅\nSession: ${data.session ? "YES" : "NO"}`);
    } catch (e: any) {
      setStatus(`Crash:\n${e?.message ?? String(e)}`);
    }
  }

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
        setStats({ totalWorkouts: 0, totalDistanceM: 0 });
        return;
      }

      const { count: workoutCount, error: countErr } = await supabase
        .from("workouts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid);

      if (countErr) throw countErr;

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

      setStats({
        totalWorkouts: workoutCount ?? 0,
        totalDistanceM,
      });
    } catch (e: any) {
      Alert.alert("Stats error", e?.message ?? "Failed to load stats");
      setStats({ totalWorkouts: 0, totalDistanceM: 0 });
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
    runDiagnostics();
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  return (
    <FormScreen>
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Profile</Text>

      <View
        style={{
          marginTop: 12,
          padding: 12,
          borderWidth: 1,
          borderRadius: 12,
          borderColor: c.border,
          backgroundColor: c.card,
        }}
      >
        {loadingProfile ? (
          <ActivityIndicator />
        ) : !profile ? (
          <Text style={{ color: c.subtext, fontSize: 16 }}>No profile found.</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Avatar
                uri={(profile as any).avatar_url ?? null}
                name={profile.full_name ?? (profile as any).username ?? "User"}
                size={72}
              />

              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 20, fontWeight: "900", color: c.text }}>
                  {profile.full_name || "Unnamed"}
                </Text>

                {!!(profile as any).username && (
                  <Text style={{ color: c.subtext }}>@{(profile as any).username}</Text>
                )}

                <Text style={{ color: c.subtext }}>
                  Role: {profile.role ?? "athlete"}
                </Text>

                {profile.school ? <Text style={{ color: c.subtext }}>School: {profile.school}</Text> : null}
                {profile.team ? <Text style={{ color: c.subtext }}>Team: {profile.team}</Text> : null}
                {profile.grad_year ? (
                  <Text style={{ color: c.subtext }}>Grad Year: {profile.grad_year}</Text>
                ) : null}
              </View>
            </View>

            {!!(profile as any).bio && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: c.text, fontWeight: "800" }}>Bio</Text>
                <Text style={{ color: c.subtext, marginTop: 4 }}>{(profile as any).bio}</Text>
              </View>
            )}

            <View style={{ marginTop: 14, gap: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Stats</Text>

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

            <Pressable
              onPress={() => router.push("/(tabs)/profile-edit")}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: c.primary,
              }}
            >
              <Text style={{ textAlign: "center", color: c.primaryText, fontWeight: "700" }}>
                Edit Profile
              </Text>
            </Pressable>

            <Pressable
              onPress={loadAll}
              style={{
                marginTop: 10,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <Text style={{ textAlign: "center", color: c.text, fontWeight: "700" }}>
                Refresh
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable
        onPress={handleLogout}
        style={{
          marginTop: 12,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <Text style={{ textAlign: "center", color: c.text, fontWeight: "700" }}>
          Log Out
        </Text>
      </Pressable>

      <Text style={{ marginTop: 14, fontSize: 14, fontWeight: "600", color: c.subtext }}>
        Diagnostics
      </Text>
      <Text style={{ fontSize: 14, color: c.subtext, marginTop: 4 }}>{status}</Text>
    </FormScreen>
  );
}