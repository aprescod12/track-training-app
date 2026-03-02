import { Text, Pressable, ActivityIndicator, Alert, View } from "react-native";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { router } from "expo-router";
import { getMyProfile, Profile } from "../../lib/profile";

export default function ProfileScreen() {
  const c = useAppColors();

  const [status, setStatus] = useState("Loading...");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  useEffect(() => {
    runDiagnostics();
    loadProfile();
  }, []);

  return (
    <FormScreen>
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Profile</Text>

      {/* Real profile card */}
      <View style={{ marginTop: 12, padding: 12, borderWidth: 1, borderRadius: 12, borderColor: c.border }}>
        {loadingProfile ? (
          <ActivityIndicator />
        ) : !profile ? (
          <Text style={{ color: c.subtext, fontSize: 16 }}>No profile found.</Text>
        ) : (
          <>
            <Text style={{ fontSize: 18, fontWeight: "700", color: c.text }}>
              {profile.full_name || "Unnamed"}
            </Text>

            <Text style={{ marginTop: 6, color: c.subtext }}>
              Role: {profile.role ?? "athlete"}
            </Text>
            {profile.school ? <Text style={{ color: c.subtext }}>School: {profile.school}</Text> : null}
            {profile.team ? <Text style={{ color: c.subtext }}>Team: {profile.team}</Text> : null}
            {profile.grad_year ? (
              <Text style={{ color: c.subtext }}>Grad Year: {profile.grad_year}</Text>
            ) : null}

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
              onPress={loadProfile}
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

      {/* Keep your diagnostics (recruiter-friendly) */}
      <Text style={{ marginTop: 14, fontSize: 14, fontWeight: "600", color: c.subtext }}>
        Diagnostics
      </Text>
      <Text style={{ fontSize: 14, color: c.subtext, marginTop: 4 }}>{status}</Text>
    </FormScreen>
  );
}