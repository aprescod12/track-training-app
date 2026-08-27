import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import FormScreen from "../components/FormScreen";
import PrimaryButton from "../components/PrimaryButton";
import { formatYMD } from "../lib/date";
import { markOnboardingComplete } from "../lib/onboarding";
import { supabase } from "../lib/supabase";
import { useAppColors } from "../lib/theme";

export default function OnboardingScreen() {
  const c = useAppColors();
  const [finishing, setFinishing] = useState(false);

  async function finish(destination: string) {
    if (finishing) return;
    setFinishing(true);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (userId) await markOnboardingComplete(userId);
    } finally {
      router.replace(destination as any);
      setFinishing(false);
    }
  }

  const cards = [
    {
      title: "Log what you actually did",
      body: "Record track sessions and lifts so your training history reflects the work you completed, not just what was planned.",
    },
    {
      title: "Keep training on one calendar",
      body: "Your calendar brings together personal events, logged workouts, and any workouts assigned to you by a coach.",
    },
    {
      title: "Team sharing stays explicit",
      body: "A personal workout stays personal unless you deliberately attach it to a team assignment. Team membership alone does not expose your training history.",
    },
  ];

  return (
    <FormScreen
      edges={["top", "bottom", "left", "right"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 16 }}
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 30, fontWeight: "900", color: c.text }}>
          Welcome to Track Training
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: c.subtext }}>
          Three things to know before your first session.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        {cards.map((card, index) => (
          <View
            key={card.title}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 16,
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: c.primary, fontWeight: "900" }}>0{index + 1}</Text>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "800" }}>
              {card.title}
            </Text>
            <Text style={{ color: c.subtext, lineHeight: 21 }}>{card.body}</Text>
          </View>
        ))}
      </View>

      <Pressable
        disabled={finishing}
        onPress={() => finish(`/modal?date=${formatYMD(new Date())}`)}
        style={({ pressed }) => ({
          backgroundColor: c.primary,
          borderRadius: 14,
          padding: 15,
          alignItems: "center",
          opacity: finishing ? 0.5 : pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: c.primaryText, fontWeight: "900", fontSize: 16 }}>
          {finishing ? "Opening…" : "Log my first workout"}
        </Text>
      </Pressable>

      <PrimaryButton
        title="Explore the app first"
        onPress={() => finish("/(tabs)")}
        disabled={finishing}
      />
    </FormScreen>
  );
}
