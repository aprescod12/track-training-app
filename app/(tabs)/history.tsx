import { View, Text } from "react-native";

export default function HistoryScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>History</Text>
      <Text>Later: list past workouts from Supabase.</Text>
    </View>
  );
}
