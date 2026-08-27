import { Stack, router } from "expo-router";
import { Pressable, Text } from "react-native";
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
      <Stack.Screen
        name="index"
        options={{
          title: "Teams",
          headerBackVisible: false,
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.text, fontWeight: "700" }}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: "Create Team" }} />
      <Stack.Screen name="[teamId]" options={{ title: "Team" }} />
    </Stack>
  );
}
