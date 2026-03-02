import { Pressable, Text } from "react-native";
import { useAppColors } from "../lib/theme";

type Props = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
};

export default function PrimaryButton({ title, onPress, disabled = false }: Props) {
  const c = useAppColors();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 12,
        padding: 14,
        alignItems: "center",
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        backgroundColor: c.card, // keeps it readable in dark mode
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }}>{title}</Text>
    </Pressable>
  );
}