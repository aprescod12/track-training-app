import { View, Text } from "react-native";
import { router } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";

export default function LogScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Log Workout</Text>
      <Text>We’ll build a full form here, but for now use the modal.</Text>

      <PrimaryButton title="Open Log Modal" onPress={() => router.push("/modal")} />
    </View>
  );
}
