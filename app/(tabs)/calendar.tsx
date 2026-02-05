import { View, Text } from "react-native";
import { router } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";

export default function CalendarScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Calendar</Text>
      <Text>Later: tap a day → view workouts.</Text>

      <PrimaryButton title="Quick Log (Modal)" onPress={() => router.push("/modal")} />
    </View>
  );
}

