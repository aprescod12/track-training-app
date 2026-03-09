import { useColorScheme } from "react-native";

export function useAppColors() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";

  const bg = dark ? "#000" : "#fff";

  return {
    dark,
    bg,
    background: bg,
    surface: dark ? "#0a0a0a" : "#f5f5f5",
    card: dark ? "#111" : "#fff",
    cardElevated: dark ? "#151515" : "#fff",
    text: dark ? "#fff" : "#000",
    subtext: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)",
    border: dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)",
    primary: dark ? "#fff" : "#000",
    primaryText: dark ? "#000" : "#fff",
  };
}