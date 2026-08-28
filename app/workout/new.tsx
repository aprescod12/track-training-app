import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { TRAINING_DOMAINS, type TrainingDomain } from "../../lib/trainingDomains";

const descriptions: Record<TrainingDomain, string> = {
  running: "Sprints, hurdles, middle distance, distance, relays, drills, and timed reps.",
  jumps: "Long jump, triple jump, high jump, pole vault, and attempt-based field work.",
  throws: "Shot put, discus, hammer, javelin, implement-specific practice, and attempts.",
  lift: "Strength training with set-by-set reps and weight.",
};

function hrefForDomain(domain: TrainingDomain, date?: string) {
  const dateQuery = date ? `&date=${encodeURIComponent(date)}` : "";
  if (domain === "jumps" || domain === "throws") {
    return `/field-log?domain=${domain}${dateQuery}`;
  }
  return `/modal?domain=${domain}${dateQuery}`;
}

export default function NewWorkoutDomainScreen() {
  const c = useAppColors();
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = typeof rawDate === "string" ? rawDate : undefined;

  return (
    <FormScreen contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center" }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>What did you train?</Text>
        <Text style={{ color: c.subtext }}>
          Choose the training domain so the log matches what actually happened in practice.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        {TRAINING_DOMAINS.map((domain) => (
          <Pressable
            key={domain.value}
            onPress={() => router.push(hrefForDomain(domain.value, date) as any)}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 16,
              padding: 16,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>{domain.label}</Text>
            <Text style={{ color: c.subtext }}>{descriptions[domain.value]}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.back()}
        style={{ alignSelf: "center", paddingHorizontal: 14, paddingVertical: 8 }}
      >
        <Text style={{ color: c.subtext, fontWeight: "700" }}>Cancel</Text>
      </Pressable>
    </FormScreen>
  );
}
