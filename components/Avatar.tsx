import { Image, Text, View } from "react-native";
import { useAppColors } from "../lib/theme";

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

export default function Avatar({ uri, name, size = 44 }: AvatarProps) {
  const c = useAppColors();

  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: c.text, fontWeight: "800", fontSize: Math.max(14, size * 0.32) }}>
        {initial}
      </Text>
    </View>
  );
}