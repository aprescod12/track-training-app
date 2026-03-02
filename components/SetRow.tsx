import { View, Text } from "react-native";
import { useAppColors } from "../lib/theme";

export default function SetRow({ label }: { label: string }) {
  const c = useAppColors();

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
      <Text style={{ color: c.text }}>{label}</Text>
      <Text style={{ color: c.subtext }}>—</Text>
    </View>
  );
}