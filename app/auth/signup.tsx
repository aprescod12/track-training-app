import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { Stack, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

export default function SignupScreen() {
  const c = useAppColors();

  const [fullName, setFullName] = useState("");
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

  async function onSignup() {
    try {
      setLoading(true);

      const e = email.trim().toLowerCase();
      if (!e || !password) {
        Alert.alert("Missing info", "Enter email and password.");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: e,
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (error) throw error;

      Alert.alert(
        "Account created",
        "If email confirmation is enabled, check your inbox to verify, then log in."
      );

      router.replace("/auth/login");
    } catch (err: any) {
      Alert.alert("Signup failed", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}