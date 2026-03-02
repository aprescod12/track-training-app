import { Stack } from "expo-router";
import { useAppColors } from "../../lib/theme";

export default function WorkoutLayout() {
  const c = useAppColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: c.bg,
        },
        headerTitleStyle: {
          color: c.text,
          fontWeight: "800",
        },
        headerTintColor: c.text,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Workout" }} />
      <Stack.Screen name="[id]/edit" options={{ title: "Edit Workout" }} />
    </Stack>
  );
}