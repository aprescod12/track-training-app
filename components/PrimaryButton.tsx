import { Pressable, Text } from "react-native";

type Props = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
};

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
}: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        alignItems: "center",
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: "600" }}>
        {title}
      </Text>
    </Pressable>
  );
}