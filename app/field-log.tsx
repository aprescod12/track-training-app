import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import FormScreen from "../components/FormScreen";
import PrimaryButton from "../components/PrimaryButton";
import { formatYMD } from "../lib/date";
import { supabase } from "../lib/supabase";
import { useAppColors } from "../lib/theme";
import {
  JUMP_EVENTS,
  THROW_EVENTS,
  fieldAttemptOutcomes,
  fieldEventLabel,
  isVerticalJump,
  type FieldAttemptOutcome,
  type FieldEventCode,
  type FieldTrainingDomain,
} from "../lib/trainingDomains";
import {
  maybeCreateComebackAchievement,
  maybeCreateWeeklyWorkoutCountAchievement,
  maybeCreateWorkoutStreakAchievement,
} from "../lib/achievements";

type AttemptDraft = {
  mark: string;
  outcome: FieldAttemptOutcome;
  notes: string;
};

function parsePositiveNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function defaultOutcome(eventCode: FieldEventCode): FieldAttemptOutcome {
  return isVerticalJump(eventCode) ? "clear" : "valid";
}

function blankAttempt(eventCode: FieldEventCode): AttemptDraft {
  return { mark: "", outcome: defaultOutcome(eventCode), notes: "" };
}

export default function FieldLogScreen() {
  const c = useAppColors();
  const params = useLocalSearchParams<{ domain?: string | string[]; date?: string | string[] }>();
  const rawDomain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const domain: FieldTrainingDomain = rawDomain === "throws" ? "throws" : "jumps";
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = typeof rawDate === "string" ? rawDate : formatYMD(new Date());

  const eventOptions = domain === "throws" ? THROW_EVENTS : JUMP_EVENTS;
  const initialEvent = eventOptions[0].value as FieldEventCode;
  const [eventCode, setEventCode] = useState<FieldEventCode>(initialEvent);
  const [title, setTitle] = useState("");
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [implementWeight, setImplementWeight] = useState("");
  const [attempts, setAttempts] = useState<AttemptDraft[]>([blankAttempt(initialEvent)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventLabel = fieldEventLabel(eventCode);
  const vertical = isVerticalJump(eventCode);
  const outcomes = useMemo(() => fieldAttemptOutcomes(eventCode), [eventCode]);

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
    color: c.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  } as const;

  function chooseEvent(next: FieldEventCode) {
    setEventCode(next);
    setAttempts([blankAttempt(next)]);
    setError(null);
  }

  function patchAttempt(index: number, patch: Partial<AttemptDraft>) {
    setAttempts((current) =>
      current.map((attempt, attemptIndex) =>
        attemptIndex === index ? { ...attempt, ...patch } : attempt
      )
    );
  }

  function removeAttempt(index: number) {
    setAttempts((current) => {
      const next = current.filter((_, attemptIndex) => attemptIndex !== index);
      return next.length ? next : [blankAttempt(eventCode)];
    });
  }

  async function save() {
    setError(null);

    const implementWeightKg = domain === "throws" ? parsePositiveNumber(implementWeight) : null;
    if (domain === "throws" && implementWeightKg == null) {
      setError("Enter the implement weight in kilograms.");
      return;
    }

    const cleanedAttempts = attempts.map((attempt, index) => {
      const mark = parsePositiveNumber(attempt.mark);
      const requiresMark =
        vertical || attempt.outcome === "valid" || attempt.outcome === "clear" || attempt.outcome === "miss" || attempt.outcome === "pass";

      if (requiresMark && mark == null) {
        throw new Error(
          vertical
            ? `Attempt ${index + 1} needs a bar height.`
            : `Attempt ${index + 1} needs a measured mark or should be marked Foul/Unmeasured.`
        );
      }

      return {
        attempt_number: index + 1,
        mark_m: attempt.outcome === "unmeasured" ? null : mark,
        outcome: attempt.outcome,
        notes: attempt.notes.trim() || null,
      };
    });

    if (!cleanedAttempts.length) {
      setError("Add at least one attempt.");
      return;
    }

    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const uid = userData.user?.id;
      if (!uid) throw new Error("Please sign in to log training.");

      let priorBest: number | null = null;
      let bestQuery = supabase
        .from("field_event_bests_v")
        .select("best_mark_m")
        .eq("user_id", uid)
        .eq("event_code", eventCode);

      bestQuery =
        domain === "throws"
          ? bestQuery.eq("implement_weight_kg", implementWeightKg)
          : bestQuery.is("implement_weight_kg", null);

      const { data: priorBestRow } = await bestQuery.maybeSingle();
      if (priorBestRow?.best_mark_m != null) priorBest = Number(priorBestRow.best_mark_m);

      const { data: exercise, error: exerciseError } = await supabase
        .from("exercises")
        .select("exercise_id")
        .eq("name", eventLabel)
        .eq("category", domain)
        .limit(1)
        .maybeSingle();
      if (exerciseError) throw exerciseError;
      if (!exercise?.exercise_id) {
        throw new Error(`${eventLabel} is not available yet. Apply the field-event database migration first.`);
      }

      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          user_id: uid,
          workout_date: date,
          title: title.trim() || `${eventLabel} Practice`,
          notes: workoutNotes.trim() || null,
          workout_type: domain,
        })
        .select("id")
        .single();
      if (workoutError) throw workoutError;

      const { data: entry, error: entryError } = await supabase
        .from("workout_entries")
        .insert({
          workout_id: workout.id,
          user_id: uid,
          exercise_id: exercise.exercise_id,
          exercise: eventLabel,
          sets: 1,
          notes: entryNotes.trim() || null,
          event_code: eventCode,
          implement_weight_kg: implementWeightKg,
        })
        .select("id")
        .single();

      if (entryError || !entry?.id) {
        await supabase.from("workouts").delete().eq("id", workout.id);
        throw entryError ?? new Error("Could not create the field-event entry.");
      }

      const { error: attemptsError } = await supabase.from("field_attempts").insert(
        cleanedAttempts.map((attempt) => ({ ...attempt, entry_id: entry.id }))
      );

      if (attemptsError) {
        await supabase.from("workouts").delete().eq("id", workout.id);
        throw attemptsError;
      }

      try {
        await maybeCreateWorkoutStreakAchievement({ userId: uid, workoutId: workout.id });
        await maybeCreateWeeklyWorkoutCountAchievement({ userId: uid, workoutId: workout.id });
        await maybeCreateComebackAchievement({ userId: uid, workoutId: workout.id });
      } catch (achievementError) {
        console.log("Field workout achievement update error:", achievementError);
      }

      const currentBest = cleanedAttempts.reduce<number | null>((best, attempt) => {
        const counts = attempt.outcome === "valid" || attempt.outcome === "clear";
        if (!counts || attempt.mark_m == null) return best;
        return best == null ? attempt.mark_m : Math.max(best, attempt.mark_m);
      }, null);

      const newTrainingBest =
        currentBest != null && (priorBest == null || currentBest > priorBest);

      router.replace({
        pathname: "/field-workout/[id]",
        params: {
          id: workout.id,
          saved: "1",
          ...(newTrainingBest ? { trainingBest: String(currentBest) } : {}),
        },
      });
    } catch (saveError: any) {
      setError(saveError?.message ?? String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen contentContainerStyle={{ width: "100%", maxWidth: 820, alignSelf: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>
            Log {domain === "throws" ? "Throws" : "Jumps"}
          </Text>
          <Text style={{ color: c.subtext }}>
            Record practice attempts directly. Wind is intentionally not part of this first version.
          </Text>
        </View>
        <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: c.subtext, fontWeight: "700" }}>Cancel</Text>
        </Pressable>
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "700" }}>{error}</Text>}

      <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 16, padding: 14, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "900", color: c.text }}>Event</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {eventOptions.map((event) => {
            const selected = eventCode === event.value;
            return (
              <Pressable
                key={event.value}
                onPress={() => chooseEvent(event.value as FieldEventCode)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? c.primary : c.border,
                  backgroundColor: selected ? c.primary : c.bg,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "800" }}>
                  {event.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontWeight: "800", color: c.text }}>Date</Text>
        <View style={[inputStyle, { justifyContent: "center" }]}>
          <Text style={{ color: c.text, fontWeight: "700" }}>{date}</Text>
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={`${eventLabel} Practice`}
          placeholderTextColor={c.subtext}
          style={inputStyle}
        />

        {domain === "throws" && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Implement weight (kg)</Text>
            <TextInput
              value={implementWeight}
              onChangeText={setImplementWeight}
              placeholder="e.g. 7.26"
              keyboardType="decimal-pad"
              placeholderTextColor={c.subtext}
              style={inputStyle}
            />
            <Text style={{ color: c.subtext, fontSize: 12 }}>
              Start a separate workout entry when changing implement weight so marks stay comparable.
            </Text>
          </View>
        )}

        <TextInput
          value={entryNotes}
          onChangeText={setEntryNotes}
          placeholder={domain === "throws" ? "Technique / practice focus (optional)" : "Approach / technical focus (optional)"}
          placeholderTextColor={c.subtext}
          style={inputStyle}
        />

        <TextInput
          value={workoutNotes}
          onChangeText={setWorkoutNotes}
          placeholder="Workout notes (optional)"
          placeholderTextColor={c.subtext}
          multiline
          style={[inputStyle, { minHeight: 72, textAlignVertical: "top" }]}
        />
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>Attempts</Text>
        <Text style={{ color: c.subtext }}>
          {vertical
            ? "Enter the bar height for each clear, miss, or pass."
            : "Valid attempts need a mark. Fouls and unmeasured attempts can be saved without one."}
        </Text>
      </View>

      {attempts.map((attempt, index) => (
        <View
          key={index}
          style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 16, padding: 14, gap: 10 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "900", color: c.text }}>Attempt {index + 1}</Text>
            {attempts.length > 1 && (
              <Pressable onPress={() => removeAttempt(index)}>
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>Remove</Text>
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {outcomes.map((option) => {
              const selected = attempt.outcome === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => patchAttempt(index, { outcome: option.value })}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.primary : c.bg,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "800" }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {attempt.outcome !== "unmeasured" && (
            <TextInput
              value={attempt.mark}
              onChangeText={(value) => patchAttempt(index, { mark: value })}
              placeholder={vertical ? "Bar height (m)" : "Mark (m)"}
              keyboardType="decimal-pad"
              placeholderTextColor={c.subtext}
              style={inputStyle}
            />
          )}

          <TextInput
            value={attempt.notes}
            onChangeText={(value) => patchAttempt(index, { notes: value })}
            placeholder="Attempt note (optional)"
            placeholderTextColor={c.subtext}
            style={inputStyle}
          />
        </View>
      ))}

      <PrimaryButton
        title="Add attempt"
        onPress={() => setAttempts((current) => [...current, blankAttempt(eventCode)])}
      />

      <Pressable
        onPress={saving ? undefined : save}
        disabled={saving}
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.primary,
          borderRadius: 14,
          padding: 14,
          alignItems: "center",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: c.primaryText, fontWeight: "800" }}>Saving…</Text>
          </View>
        ) : (
          <Text style={{ color: c.primaryText, fontSize: 16, fontWeight: "900" }}>Save workout</Text>
        )}
      </Pressable>
    </FormScreen>
  );
}
