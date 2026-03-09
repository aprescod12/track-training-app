import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

export default function TrainingHubScreen() {
  const c = useAppColors();

  function HubTile({
    title,
    subtitle,
    onPress,
    large = false,
  }: {
    title: string;
    subtitle: string;
    onPress: () => void;
    large?: boolean;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          minHeight: large ? 120 : 100,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 16,
          padding: 16,
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.text, fontSize: large ? 18 : 17, fontWeight: "900" }}>{title}</Text>
          <Text style={{ color: c.subtext, lineHeight: 18 }}>{subtitle}</Text>
        </View>

        <Text style={{ color: c.text, fontWeight: "800" }}>Open →</Text>
      </Pressable>
    );
  }

  function Section({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
          borderRadius: 18,
          padding: 16,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>{title}</Text>
        {children}
      </View>
    );
  }

  return (
    <FormScreen>
      <View style={{ gap: 14 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 20,
            padding: 18,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>Training Hub</Text>
          <Text style={{ color: c.subtext, lineHeight: 20 }}>
            Your central space for logging workouts, checking stats, and managing your training flow.
          </Text>
        </View>

        <Section title="Quick Actions">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <HubTile
              title="Log Workout"
              subtitle="Start a new workout entry for today or another date."
              onPress={() => router.push("/modal")}
              large
            />
            <HubTile
              title="Calendar"
              subtitle="See workouts and events across your schedule."
              onPress={() => router.push("/(tabs)/calendar")}
              large
            />
          </View>
        </Section>

        <Section title="Performance">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <HubTile
              title="Track Stats"
              subtitle="Distance, recent workouts, top exercises, and PR activity."
              onPress={() => router.push("/profile/track-stats")}
            />
            <HubTile
              title="Lift Stats"
              subtitle="Volume, sets, reps, top lifts, and recent strength work."
              onPress={() => router.push("/profile/lift-stats")}
            />
          </View>
        </Section>

        <Section title="Profile & Progress">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <HubTile
              title="Overview"
              subtitle="See your training snapshot, activity, and overall trends."
              onPress={() => router.push("/profile/overview")}
            />
            <HubTile
              title="Profile"
              subtitle="Return to your profile page and manage your account."
              onPress={() => router.push("/(tabs)/profile")}
            />
          </View>
        </Section>

        <Section title="Suggested Flow">
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => router.push("/modal")}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "900" }}>1. Log today’s workout</Text>
              <Text style={{ color: c.subtext }}>
                Add a track or lift session and keep your history updated.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/profile/overview")}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "900" }}>2. Review your overview</Text>
              <Text style={{ color: c.subtext }}>
                Check weekly and monthly progress, recent activity, and your training split.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/profile/track-stats")}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "900" }}>3. Dive into performance</Text>
              <Text style={{ color: c.subtext }}>
                Open Track Stats or Lift Stats to look deeper at your numbers.
              </Text>
            </Pressable>
          </View>
        </Section>
      </View>
    </FormScreen>
  );
}