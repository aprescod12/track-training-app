import { View, Text } from "react-native";

export default function WorkoutCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 }}>
      <Text style={{ fontSize: 16, fontWeight: "700" }}>{title}</Text>
      {!!subtitle && <Text>{subtitle}</Text>}
    </View>
  );
}
