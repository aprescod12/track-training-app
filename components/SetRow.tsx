import { View, Text } from "react-native";

export default function SetRow({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
      <Text>{label}</Text>
      <Text>—</Text>
    </View>
  );
}
