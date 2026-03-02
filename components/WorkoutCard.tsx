import { View, Text, Pressable } from "react-native";
import { useAppColors } from "../lib/theme";

type Props = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
};

export default function WorkoutCard({ title, subtitle, onPress }: Props) {
  const c = useAppColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 14,
        padding: 14,
        backgroundColor: c.card,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ fontWeight: "800", fontSize: 16, color: c.text }}>
        {title}
      </Text>

      {subtitle ? (
        <Text style={{ marginTop: 4, color: c.subtext }}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}