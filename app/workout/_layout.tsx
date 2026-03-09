import { Stack } from "expo-router";
import { useAppColors } from "../../lib/theme";

export default function WorkoutLayout() {
  const c = useAppColors();

  return (
    <Stack
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: c.bg }, // ✅ important for dark mode behind screens
    }}
    >
      <Stack.Screen
          name="[id]"
          options={{
            title: "Workout",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

      <Stack.Screen
          name="[id]/edit"
          options={{
            presentation: "modal",
            title: "Edit Workout",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />
    </Stack>
  );
}