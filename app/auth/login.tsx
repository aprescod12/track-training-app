import { useState } from "react";
import { Text, TextInput, Pressable, Alert } from "react-native";
import { Stack, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

export default function LoginScreen() {
  const c = useAppColors();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const placeholderColor = c.dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.card,
    color: c.text,
  } as const;

  async function onLogin() {
    try {
      setLoading(true);

      const e = email.trim().toLowerCase();
      if (!e || !password) {
        Alert.alert("Missing info", "Enter email and password.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });

      if (error) throw error;

      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Login failed", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen contentContainerStyle={{ justifyContent: "center", flexGrow: 1 }}>
      <Stack.Screen options={{ title: "Log In" }} />

      <Text style={{ fontSize: 24, fontWeight: "800", color: c.text }}>Welcome back</Text>
      <Text style={{ color: c.subtext }}>
        Log in with the email and password you used when creating your account.
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
        onPress={onLogin}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: loading ? c.border : c.primary,
          alignItems: "center",
        }}
      >
        <Text style={{ color: c.primaryText, fontWeight: "800" }}>
          {loading ? "Logging in..." : "Log In"}
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace("/auth/signup")}>
        <Text style={{ textAlign: "center", color: c.subtext, fontWeight: "700" }}>
          No account? Sign up
        </Text>
      </Pressable>
    </FormScreen>
  );
}