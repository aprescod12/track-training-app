import { Stack } from "expo-router";

export default function WorkoutLayout() {
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ title: "Workout" }} />
      <Stack.Screen name="[id]/edit" options={{ title: "Edit Workout" }} />
    </Stack>
  );
}