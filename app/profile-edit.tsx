import { useEffect, useState } from "react";
import { Text, TextInput, Pressable, ActivityIndicator, Alert, View } from "react-native";
import { Stack, router } from "expo-router";
import FormScreen from "../components/FormScreen";
import { useAppColors } from "../lib/theme";
import { getMyProfile, updateMyProfile, Profile } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { pickAndUploadAvatar } from "../lib/avatar";
import Avatar from "../components/Avatar";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,20}$/.test(value);
}

export default function EditProfileScreen() {
  const c = useAppColors();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [school, setSchool] = useState("");
  const [team, setTeam] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const p = await getMyProfile();
        if (!mounted) return;

        setProfile(p);
        setFullName(p.full_name ?? "");
        setUsername(((p as any).username ?? "") as string);
        setAvatarUrl(((p as any).avatar_url ?? "") as string);
        setSchool(p.school ?? "");
        setTeam(p.team ?? "");
        setGradYear(p.grad_year ? String(p.grad_year) : "");
        setBio((((p as any).bio ?? "") as string) || "");
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

  async function onUploadAvatar() {
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (userErr || !uid) {
        Alert.alert("Upload failed", "You must be logged in to upload an avatar.");
        return;
      }

      const publicUrl = await pickAndUploadAvatar(uid);
      if (!publicUrl) return;

      setAvatarUrl(publicUrl);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Could not upload avatar.");
    }
  }

  async function onSave() {
    try {
      setSaving(true);

      const gy = gradYear.trim() ? Number(gradYear.trim()) : null;
      const normalizedUsername = normalizeUsername(username);

      if (gy !== null && (!Number.isFinite(gy) || gy < 1900 || gy > 2100)) {
        Alert.alert("Invalid grad year", "Enter a year between 1900 and 2100.");
        return;
      }

      if (!normalizedUsername) {
        Alert.alert("Missing username", "Please enter a username.");
        return;
      }

      if (!isValidUsername(normalizedUsername)) {
        Alert.alert(
          "Invalid username",
          "Username must be 3–20 characters and use only lowercase letters, numbers, and underscores."
        );
        return;
      }

      const myId = (profile as any)?.id ?? null;

      const { data: existing, error: usernameErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (usernameErr) throw usernameErr;

      if (existing && existing.id !== myId) {
        Alert.alert("Username taken", "That username is already in use. Try another one.");
        return;
      }

      await updateMyProfile({
        full_name: fullName.trim() || null,
        username: normalizedUsername,
        avatar_url: avatarUrl.trim() || null,
        school: school.trim() || null,
        team: team.trim() || null,
        grad_year: gy,
        bio: bio.trim() || null,
      } as any);

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
    backgroundColor: c.card,
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
          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 14,
              padding: 12,
              backgroundColor: c.card,
              gap: 12,
            }}
          >
            <View style={{ alignItems: "center" }}>
              <Avatar uri={avatarUrl || null} name={fullName || username || "User"} size={84} />
            </View>

            <View>
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Full name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                style={inputStyle}
              />
            </View>

            <View>
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Username</Text>
              <TextInput
                value={username}
                onChangeText={(v) => setUsername(normalizeUsername(v))}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle}
              />
              <Text style={{ color: c.subtext, marginTop: 4, fontSize: 12 }}>
                3–20 chars • lowercase letters, numbers, underscores
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Avatar</Text>

              <Pressable
                onPress={onUploadAvatar}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ color: c.text, fontWeight: "800" }}>
                  {avatarUrl ? "Change Avatar" : "Upload Avatar"}
                </Text>
              </Pressable>
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

            <View>
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                multiline
                style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
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
        </View>
      )}
    </FormScreen>
  );
}