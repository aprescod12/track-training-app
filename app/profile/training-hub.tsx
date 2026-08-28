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
          minWidth: 220,
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
    <FormScreen contentContainerStyle={{ width: "100%", maxWidth: 1100, alignSelf: "center" }}>
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
            Your central space for personal workouts, teams, assignments, stats, and your training schedule.
          </Text>
        </View>

        <Section title="Quick Actions">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <HubTile
              title="Log Workout"
              subtitle="Start a new workout entry for today or another date."
              onPress={() => router.push("/workout/new")}
              large
            />
            <HubTile
              title="Calendar"
              subtitle="See workouts, assigned sessions, and personal events."
              onPress={() => router.push("/(tabs)/calendar")}
              large
            />
          </View>
        </Section>

        <Section title="Team & Coach Tools">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <HubTile
              title="Teams & Roster"
              subtitle="Create teams, invite members, view the roster, and configure explicit coaching access."
              onPress={() => router.push("/teams")}
              large
            />
            <HubTile
              title="Assignments & Coach Tools"
              subtitle="Open assigned workouts, create prescriptions, assign training, and review athlete submissions."
              onPress={() => router.push("/team-training")}
              large
            />
          </View>
        </Section>

        <Section title="Performance">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <HubTile
              title="Running Stats"
              subtitle="Running distance, recent workouts, top exercises, and PR activity."
              onPress={() => router.push("/profile/track-stats")}
            />
            <HubTile
              title="Field Stats"
              subtitle="Jump and throw training bests, implements, and recent field sessions."
              onPress={() => router.push("/profile/field-stats")}
            />
            <HubTile
              title="Lift Stats"
              subtitle="Volume, sets, reps, top lifts, and recent strength work."
              onPress={() => router.push("/profile/lift-stats")}
            />
          </View>
        </Section>

        <Section title="Profile & Progress">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
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
              onPress={() => router.push("/workout/new")}
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
                Choose Running, Jumps, Throws, or Lift and keep your history updated.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/team-training")}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "900" }}>2. Check team training</Text>
              <Text style={{ color: c.subtext }}>
                Review assigned sessions and submit outcomes when your team is using the coach workflow.
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
              <Text style={{ color: c.text, fontWeight: "900" }}>3. Review your overview</Text>
              <Text style={{ color: c.subtext }}>
                Check weekly and monthly progress, recent activity, and your training split.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/profile/field-stats")}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "900" }}>4. Dive into performance</Text>
              <Text style={{ color: c.subtext }}>
                Open Running, Field, or Lift Stats to look deeper at your numbers.
              </Text>
            </Pressable>
          </View>
        </Section>
      </View>
    </FormScreen>
  );
}
