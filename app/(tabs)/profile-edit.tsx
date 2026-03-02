import { useEffect, useState } from "react";
import { Text, TextInput, Pressable, ActivityIndicator, Alert, View } from "react-native";
import { Stack, router } from "expo-router";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { getMyProfile, updateMyProfile, Profile } from "../../lib/profile";

export default function EditProfileScreen() {
  const c = useAppColors();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [team, setTeam] = useState("");
  const [gradYear, setGradYear] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const p = await getMyProfile();
        if (!mounted) return;
        setProfile(p);
        setFullName(p.full_name ?? "");
        setSchool(p.school ?? "");
        setTeam(p.team ?? "");
        setGradYear(p.grad_year ? String(p.grad_year) : "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load profile");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function onSave() {
    try {
      setSaving(true);

      const gy = gradYear.trim() ? Number(gradYear.trim()) : null;
      if (gy !== null && (!Number.isFinite(gy) || gy < 1900 || gy > 2100)) {
        Alert.alert("Invalid grad year", "Enter a year between 1900 and 2100.");
        return;
      }

      await updateMyProfile({
        full_name: fullName.trim() || null,
        school: school.trim() || null,
        team: team.trim() || null,
        grad_year: gy,
      });

      router.back();
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    color: c.text,
    marginTop: 6,
  } as const;

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Edit Profile" }} />

      {loading ? (
        <ActivityIndicator />
      ) : !profile ? (
        <Text style={{ color: c.subtext }}>No profile found.</Text>
      ) : (
        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ color: c.subtext, fontWeight: "700" }}>Full name</Text>
            <TextInput value={fullName} onChangeText={setFullName} style={inputStyle} />
          </View>

          <View>
            <Text style={{ color: c.subtext, fontWeight: "700" }}>School</Text>
            <TextInput value={school} onChangeText={setSchool} style={inputStyle} />
          </View>

          <View>
            <Text style={{ color: c.subtext, fontWeight: "700" }}>Team</Text>
            <TextInput value={team} onChangeText={setTeam} style={inputStyle} />
          </View>

          <View>
            <Text style={{ color: c.subtext, fontWeight: "700" }}>Grad year</Text>
            <TextInput
              value={gradYear}
              onChangeText={setGradYear}
              keyboardType="number-pad"
              style={inputStyle}
            />
          </View>

          <Pressable
            disabled={saving}
            onPress={onSave}
            style={{
              marginTop: 8,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: saving ? c.border : c.primary,
            }}
          >
            <Text style={{ textAlign: "center", color: c.primaryText, fontWeight: "800" }}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
      )}
    </FormScreen>
  );
}