import { View, Text } from "react-native";
import { Link } from "expo-router";
import PrimaryButton from "../components/PrimaryButton";

export default function ModalScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Quick Log (Modal)</Text>
      <Text>We’ll turn this into the real workout form next.</Text>

      <Link href="/(tabs)/calendar" asChild>
        <PrimaryButton title="Back to Calendar" />
      </Link>
    </View>
  );
}
