import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { View } from "react-native";
import { useAppColors } from "../lib/theme";

export default function RootLayout() {
  const c = useAppColors();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg }, // ✅ important for dark mode behind screens
        }}
      >
        <Stack.Screen name="(tabs)" />

        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Log Workout",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: true,
            title: "Login",
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerShadowVisible: false, // optional: cleaner look
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="auth/signup"
          options={{
            headerShown: true,
            title: "Sign Up",
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        />
      </Stack>

      <StatusBar style={c.dark ? "light" : "dark"} />
    </View>
  );
}