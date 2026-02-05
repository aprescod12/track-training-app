import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Log Workout" }} />
        <Stack.Screen name="auth/login" options={{ headerShown: true, title: "Login" }} />
        <Stack.Screen name="auth/signup" options={{ headerShown: true, title: "Sign Up" }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
