import { Stack } from "expo-router";
import { useAppColors } from "../../lib/theme";

export default function TeamsLayout() {
  const c = useAppColors();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "Create Team" }} />
      <Stack.Screen name="[teamId]" options={{ title: "Team" }} />
    </Stack>
  );
}
