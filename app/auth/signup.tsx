import { useState } from "react";
import { Text, TextInput, Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import AlertModal from "../../components/AlertModal";
import { useAppColors } from "../../lib/theme";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,20}$/.test(value);
}

export default function SignupScreen() {
  const c = useAppColors();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const placeholderColor = c.dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";
  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.card,
    color: c.text,
  } as const;

  function showAlert(title: string, message: string) {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOpen(true);
  }

  async function onSignup() {
    try {
      setLoading(true);

      const e = email.trim().toLowerCase();
      const u = normalizeUsername(username);
      const name = fullName.trim();

      if (!u || !e || !password) {
        showAlert("Missing info", "Enter username, email, and password.");
        return;
      }

      if (!isValidUsername(u)) {
        showAlert(
          "Invalid username",
          "Username must be 3–20 characters and use only lowercase letters, numbers, and underscores."
        );
        return;
      }

      const { data: existingUsername, error: usernameCheckErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", u)
        .maybeSingle();

      if (usernameCheckErr) throw usernameCheckErr;

      if (existingUsername) {
        showAlert("Username taken", "That username is already in use. Try another one.");
        return;
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          data: {
            full_name: name,
            username: u,
          },
        },
      });

      if (signUpErr) throw signUpErr;

      const userId = signUpData.user?.id ?? signUpData.session?.user?.id ?? null;

      if (userId) {
        const { error: profileErr } = await supabase.from("profiles").upsert(
          {
            id: userId,
            full_name: name || null,
            username: u,
          },
          { onConflict: "id" }
        );

        if (profileErr) {
          if ((profileErr as any).code === "23505") {
            showAlert("Username taken", "That username is already in use. Try another one.");
            return;
          }
          throw profileErr;
        }
      }

      showAlert(
        "Account created",
        "If email confirmation is enabled, check your inbox to verify, then log in."
      );

      router.replace("/auth/login");
    } catch (err: any) {
      showAlert("Signup failed", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormScreen
        edges={["top", "left", "right"]}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 12 }}
      >
        <Stack.Screen options={{ title: "Sign Up" }} />

        <Text style={{ fontSize: 24, fontWeight: "800", color: c.text }}>Create account</Text>

        <TextInput
          placeholder="Full name (optional)"
          placeholderTextColor={placeholderColor}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          style={inputStyle}
        />

        <TextInput
          placeholder="Username"
          placeholderTextColor={placeholderColor}
          value={username}
          onChangeText={(v) => setUsername(normalizeUsername(v))}
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
        />

        <Text style={{ color: c.subtext, marginTop: -4 }}>
          3–20 chars • lowercase letters, numbers, underscores
        </Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor={placeholderColor}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={inputStyle}
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor={placeholderColor}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={inputStyle}
        />

        <Pressable
          disabled={loading}
          onPress={onSignup}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: loading ? c.border : c.primary,
          }}
        >
          <Text style={{ color: c.primaryText, textAlign: "center", fontWeight: "800" }}>
            {loading ? "Creating..." : "Sign Up"}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/auth/login")}>
          <Text style={{ textAlign: "center", color: c.subtext }}>
            Already have an account? Log in
          </Text>
        </Pressable>
      </FormScreen>

      <AlertModal
        visible={alertOpen}
        title={alertTitle}
        message={alertMessage}
        confirmText="OK"
        onConfirm={() => setAlertOpen(false)}
        onCancel={() => setAlertOpen(false)}
      />
    </>
  );
}