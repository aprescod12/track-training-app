import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import {
  createWorkoutTemplate,
  getActiveCoachTeams,
  type CoachTeam,
  type WorkoutTemplateEntryDraft,
} from "../../lib/training";

type EntryForm = {
  exercise: string;
  sets: string;
  reps: string;
  distance: string;
  recovery: string;
  intensity: string;
  target: string;
  notes: string;
};

function blankEntry(): EntryForm {
  return {
    exercise: "",
    sets: "",
    reps: "",
    distance: "",
    recovery: "",
    intensity: "",
    target: "",
    notes: "",
  };
}

function optionalPositiveInt(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Sets and reps must be positive integers.");
  return parsed;
}

function optionalNonNegative(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

export default function NewWorkoutTemplateScreen() {
  const c = useAppColors();
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const [entries, setEntries] = useState<EntryForm[]>([blankEntry()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    try {
      const rows = await getActiveCoachTeams();
      setTeams(rows);
      setTeamId((current) => current || rows[0]?.team_id || "");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  function patchEntry(index: number, patch: Partial<EntryForm>) {
    setEntries((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  async function save() {
    const team = teams.find((item) => item.team_id === teamId);
    if (!team) {
      setError("Select an active team where you are a coach.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: WorkoutTemplateEntryDraft[] = entries
        .filter((entry) => entry.exercise.trim())
        .map((entry) => ({
          exercise_name_snapshot: entry.exercise.trim(),
          sets: optionalPositiveInt(entry.sets),
          reps: optionalPositiveInt(entry.reps),
          distance_m: optionalNonNegative(entry.distance, "Distance"),
          recovery_seconds: optionalNonNegative(entry.recovery, "Recovery"),
          intensity_text: entry.intensity.trim() || null,
          target_time_text: workoutType === "track" ? entry.target.trim() || null : null,
          target_weight: workoutType === "lift" ? optionalNonNegative(entry.target, "Target weight") : null,
          notes: entry.notes.trim() || null,
        }));

      await createWorkoutTemplate({
        team,
        title,
        description,
        workoutType,
        entries: payload,
      });

      router.replace("/team-training");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>New workout template</Text>
        <Text style={{ color: c.subtext }}>Create a reusable prescription for one of your teams.</Text>
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}

      {teams.length === 0 ? (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14 }}>
          <Text style={{ color: c.subtext }}>You need an active coach membership before creating team training.</Text>
        </View>
      ) : (
        <>
          <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Team</Text>
            {teams.map((team) => (
              <Pressable
                key={team.team_id}
                onPress={() => setTeamId(team.team_id)}
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, backgroundColor: teamId === team.team_id ? c.primary : c.bg }}
              >
                <Text style={{ color: teamId === team.team_id ? c.primaryText : c.text, fontWeight: "700" }}>{team.team_name}</Text>
              </Pressable>
            ))}

            <Text style={{ fontWeight: "800", color: c.text }}>Workout type</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["track", "lift"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setWorkoutType(type)}
                  style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 999, padding: 10, alignItems: "center", backgroundColor: workoutType === type ? c.primary : c.bg }}
                >
                  <Text style={{ color: workoutType === type ? c.primaryText : c.text, fontWeight: "700" }}>{type === "track" ? "Track" : "Lift"}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput value={title} onChangeText={setTitle} placeholder="Template title" placeholderTextColor="#8A8A8A" style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
            <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor="#8A8A8A" multiline style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: "top" }} />
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Prescription entries</Text>
            {entries.map((entry, index) => (
              <View key={index} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "800", color: c.text }}>Entry {index + 1}</Text>
                  {entries.length > 1 && (
                    <Pressable onPress={() => setEntries((current) => current.filter((_, i) => i !== index))}>
                      <Text style={{ color: "#ef4444", fontWeight: "700" }}>Remove</Text>
                    </Pressable>
                  )}
                </View>
                <TextInput value={entry.exercise} onChangeText={(value) => patchEntry(index, { exercise: value })} placeholder={workoutType === "track" ? "60m sprint" : "Back squat"} placeholderTextColor="#8A8A8A" style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput value={entry.sets} onChangeText={(value) => patchEntry(index, { sets: value })} keyboardType="numeric" placeholder="Sets" placeholderTextColor="#8A8A8A" style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                  <TextInput value={entry.reps} onChangeText={(value) => patchEntry(index, { reps: value })} keyboardType="numeric" placeholder="Reps" placeholderTextColor="#8A8A8A" style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput value={entry.distance} onChangeText={(value) => patchEntry(index, { distance: value })} keyboardType="decimal-pad" placeholder="Distance m" placeholderTextColor="#8A8A8A" style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                  <TextInput value={entry.recovery} onChangeText={(value) => patchEntry(index, { recovery: value })} keyboardType="numeric" placeholder="Recovery sec" placeholderTextColor="#8A8A8A" style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                </View>
                <TextInput value={entry.intensity} onChangeText={(value) => patchEntry(index, { intensity: value })} placeholder="Intensity (e.g. 95%)" placeholderTextColor="#8A8A8A" style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                <TextInput value={entry.target} onChangeText={(value) => patchEntry(index, { target: value })} keyboardType={workoutType === "lift" ? "decimal-pad" : "default"} placeholder={workoutType === "lift" ? "Target weight" : "Target time (e.g. 7.20)"} placeholderTextColor="#8A8A8A" style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
                <TextInput value={entry.notes} onChangeText={(value) => patchEntry(index, { notes: value })} placeholder="Entry notes (optional)" placeholderTextColor="#8A8A8A" multiline style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12, minHeight: 60, textAlignVertical: "top" }} />
              </View>
            ))}
            <PrimaryButton title="Add prescription entry" onPress={() => setEntries((current) => [...current, blankEntry()])} />
          </View>

          <PrimaryButton title={saving ? "Saving…" : "Save template"} onPress={save} disabled={saving} />
        </>
      )}
    </FormScreen>
  );
}
