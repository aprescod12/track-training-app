import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import { AppError, toAppError } from "../../lib/errors";
import {
  createWorkoutTemplate,
  getActiveCoachTeams,
  type CoachTeam,
  type WorkoutTemplateEntryDraft,
} from "../../lib/training";
import {
  coachHasTrainingPermission,
  getMyCoachTrainingPermissions,
  type CoachTrainingPermission,
  type TrainingWorkoutType,
} from "../../lib/teams";
import {
  JUMP_EVENTS,
  THROW_EVENTS,
  TRAINING_DOMAINS,
  fieldEventLabel,
  type FieldEventCode,
} from "../../lib/trainingDomains";

type EntryForm = {
  exercise: string;
  eventCode: FieldEventCode | null;
  sets: string;
  reps: string;
  distance: string;
  recovery: string;
  intensity: string;
  target: string;
  attempts: string;
  implementWeight: string;
  notes: string;
};

function defaultEventCode(domain: TrainingWorkoutType): FieldEventCode | null {
  if (domain === "jumps") return JUMP_EVENTS[0].value;
  if (domain === "throws") return THROW_EVENTS[0].value;
  return null;
}

function blankEntry(domain: TrainingWorkoutType): EntryForm {
  const eventCode = defaultEventCode(domain);
  return {
    exercise: eventCode ? fieldEventLabel(eventCode) : "",
    eventCode,
    sets: "",
    reps: "",
    distance: "",
    recovery: "",
    intensity: "",
    target: "",
    attempts: "",
    implementWeight: "",
    notes: "",
  };
}

function optionalPositiveInt(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError({ kind: "validation", message: "Enter a positive whole number." });
  }
  return parsed;
}

function optionalNonNegative(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError({ kind: "validation", message: `${label} must be zero or greater.` });
  }
  return parsed;
}

function optionalPositive(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError({ kind: "validation", message: `${label} must be greater than zero.` });
  }
  return parsed;
}

export default function NewWorkoutTemplateScreen() {
  const c = useAppColors();
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [permissionsByTeam, setPermissionsByTeam] = useState<Record<string, CoachTrainingPermission[]>>({});
  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workoutType, setWorkoutType] = useState<TrainingWorkoutType>("running");
  const [entries, setEntries] = useState<EntryForm[]>([blankEntry("running")]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    try {
      const rows = await getActiveCoachTeams();
      const permissionPairs = await Promise.all(
        rows.map(async (team) => [team.team_id, await getMyCoachTrainingPermissions(team.team_id)] as const)
      );
      setTeams(rows);
      setPermissionsByTeam(Object.fromEntries(permissionPairs));
      setTeamId((current) => current || rows[0]?.team_id || "");
    } catch (loadError: unknown) {
      setError(
        toAppError(loadError, {
          fallbackMessage: "Could not load your coach teams. Please try again.",
        }).message
      );
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const teamPermissions = permissionsByTeam[teamId] ?? [];
  const canPrescribe = coachHasTrainingPermission(teamPermissions, workoutType, "prescribe");
  const allowedDomains = useMemo(
    () =>
      TRAINING_DOMAINS.filter((domain) =>
        coachHasTrainingPermission(teamPermissions, domain.value, "prescribe")
      ),
    [teamPermissions]
  );

  useEffect(() => {
    if (!teamId || canPrescribe) return;
    const next = allowedDomains[0]?.value;
    if (next) {
      setWorkoutType(next);
      setEntries([blankEntry(next)]);
    }
  }, [teamId, canPrescribe, allowedDomains]);

  function chooseDomain(domain: TrainingWorkoutType) {
    if (!coachHasTrainingPermission(teamPermissions, domain, "prescribe")) return;
    setWorkoutType(domain);
    setEntries([blankEntry(domain)]);
    setError(null);
  }

  function patchEntry(index: number, patch: Partial<EntryForm>) {
    setEntries((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function chooseFieldEvent(index: number, eventCode: FieldEventCode) {
    patchEntry(index, {
      eventCode,
      exercise: fieldEventLabel(eventCode),
      implementWeight: workoutType === "throws" ? entries[index].implementWeight : "",
    });
  }

  async function save() {
    const team = teams.find((item) => item.team_id === teamId);
    if (!team) {
      setError("Select an active team where you are a coach.");
      return;
    }
    if (!canPrescribe) {
      setError("Your team role does not include prescription authority for this training domain.");
      return;
    }
    if (!title.trim()) {
      setError("Template title is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const isField = workoutType === "jumps" || workoutType === "throws";
      const payload: WorkoutTemplateEntryDraft[] = entries
        .filter((entry) => entry.exercise.trim())
        .map((entry) => {
          if (isField && !entry.eventCode) {
            throw new AppError({ kind: "validation", message: "Choose a field event for every entry." });
          }

          return {
            exercise_name_snapshot: entry.exercise.trim(),
            sets: isField ? null : optionalPositiveInt(entry.sets),
            reps: isField ? null : optionalPositiveInt(entry.reps),
            distance_m: workoutType === "running" ? optionalNonNegative(entry.distance, "Distance") : null,
            recovery_seconds: isField ? null : optionalNonNegative(entry.recovery, "Recovery"),
            intensity_text: isField ? null : entry.intensity.trim() || null,
            target_time_text: workoutType === "running" ? entry.target.trim() || null : null,
            target_weight: workoutType === "lift" ? optionalNonNegative(entry.target, "Target weight") : null,
            event_code: isField ? entry.eventCode : null,
            attempts: isField ? optionalPositiveInt(entry.attempts) : null,
            target_mark_m: isField ? optionalPositive(entry.target, "Target mark") : null,
            implement_weight_kg:
              workoutType === "throws" ? optionalPositive(entry.implementWeight, "Implement weight") : null,
            notes: entry.notes.trim() || null,
          };
        });

      if (!payload.length) {
        throw new AppError({ kind: "validation", message: "Add at least one prescription entry." });
      }

      await createWorkoutTemplate({ team, title, description, workoutType, entries: payload });
      router.replace("/team-training");
    } catch (saveError: unknown) {
      setError(
        toAppError(saveError, {
          fallbackMessage: "Could not save the workout template. Check the form and try again.",
        }).message
      );
    } finally {
      setSaving(false);
    }
  }

  const fieldEvents = workoutType === "jumps" ? JUMP_EVENTS : workoutType === "throws" ? THROW_EVENTS : [];
  const isField = workoutType === "jumps" || workoutType === "throws";
  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
    color: c.text,
    borderRadius: 12,
    padding: 12,
  } as const;

  return (
    <FormScreen contentContainerStyle={{ width: "100%", maxWidth: 900, alignSelf: "center" }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>New workout template</Text>
        <Text style={{ color: c.subtext }}>Create a reusable prescription within your coaching authority.</Text>
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

            <Text style={{ fontWeight: "800", color: c.text }}>Training domain</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TRAINING_DOMAINS.map((domain) => {
                const allowed = coachHasTrainingPermission(teamPermissions, domain.value, "prescribe");
                const selected = workoutType === domain.value && allowed;
                return (
                  <Pressable
                    key={domain.value}
                    disabled={!allowed}
                    onPress={() => chooseDomain(domain.value)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? c.primary : c.border,
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      backgroundColor: selected ? c.primary : c.bg,
                      opacity: allowed ? 1 : 0.4,
                    }}
                  >
                    <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}>
                      {domain.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {allowedDomains.length === 0 && (
              <Text style={{ color: c.subtext }}>
                You can view assigned-athlete training, but a team manager has not granted prescription authority in any domain.
              </Text>
            )}

            <TextInput value={title} onChangeText={setTitle} placeholder="Template title" placeholderTextColor="#8A8A8A" style={inputStyle} />
            <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor="#8A8A8A" multiline style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} />
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Prescription entries</Text>
            {entries.map((entry, index) => (
              <View key={index} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "800", color: c.text }}>Entry {index + 1}</Text>
                  {entries.length > 1 && (
                    <Pressable onPress={() => setEntries((current) => current.filter((_, i) => i !== index))}>
                      <Text style={{ color: "#ef4444", fontWeight: "700" }}>Remove</Text>
                    </Pressable>
                  )}
                </View>

                {isField ? (
                  <>
                    <Text style={{ fontWeight: "800", color: c.text }}>Event</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {fieldEvents.map((event) => {
                        const selected = entry.eventCode === event.value;
                        return (
                          <Pressable
                            key={event.value}
                            onPress={() => chooseFieldEvent(index, event.value as FieldEventCode)}
                            style={{
                              borderWidth: 1,
                              borderColor: selected ? c.primary : c.border,
                              backgroundColor: selected ? c.primary : c.bg,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}>{event.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput value={entry.attempts} onChangeText={(value) => patchEntry(index, { attempts: value })} keyboardType="numeric" placeholder="Attempts" placeholderTextColor="#8A8A8A" style={[inputStyle, { flex: 1 }]} />
                      <TextInput value={entry.target} onChangeText={(value) => patchEntry(index, { target: value })} keyboardType="decimal-pad" placeholder="Target mark m (optional)" placeholderTextColor="#8A8A8A" style={[inputStyle, { flex: 1 }]} />
                    </View>

                    {workoutType === "throws" && (
                      <TextInput
                        value={entry.implementWeight}
                        onChangeText={(value) => patchEntry(index, { implementWeight: value })}
                        keyboardType="decimal-pad"
                        placeholder="Implement weight kg (optional prescription)"
                        placeholderTextColor="#8A8A8A"
                        style={inputStyle}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <TextInput value={entry.exercise} onChangeText={(value) => patchEntry(index, { exercise: value })} placeholder={workoutType === "running" ? "60m sprint" : "Back squat"} placeholderTextColor="#8A8A8A" style={inputStyle} />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput value={entry.sets} onChangeText={(value) => patchEntry(index, { sets: value })} keyboardType="numeric" placeholder="Sets" placeholderTextColor="#8A8A8A" style={[inputStyle, { flex: 1 }]} />
                      <TextInput value={entry.reps} onChangeText={(value) => patchEntry(index, { reps: value })} keyboardType="numeric" placeholder="Reps" placeholderTextColor="#8A8A8A" style={[inputStyle, { flex: 1 }]} />
                    </View>
                    {workoutType === "running" && (
                      <TextInput value={entry.distance} onChangeText={(value) => patchEntry(index, { distance: value })} keyboardType="decimal-pad" placeholder="Distance m" placeholderTextColor="#8A8A8A" style={inputStyle} />
                    )}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput value={entry.recovery} onChangeText={(value) => patchEntry(index, { recovery: value })} keyboardType="numeric" placeholder="Recovery sec" placeholderTextColor="#8A8A8A" style={[inputStyle, { flex: 1 }]} />
                      <TextInput value={entry.intensity} onChangeText={(value) => patchEntry(index, { intensity: value })} placeholder="Intensity" placeholderTextColor="#8A8A8A" style={[inputStyle, { flex: 1 }]} />
                    </View>
                    <TextInput
                      value={entry.target}
                      onChangeText={(value) => patchEntry(index, { target: value })}
                      keyboardType={workoutType === "lift" ? "decimal-pad" : "default"}
                      placeholder={workoutType === "lift" ? "Target weight" : "Target time (e.g. 7.20)"}
                      placeholderTextColor="#8A8A8A"
                      style={inputStyle}
                    />
                  </>
                )}

                <TextInput value={entry.notes} onChangeText={(value) => patchEntry(index, { notes: value })} placeholder={isField ? "Technical instructions / approach focus" : "Entry notes (optional)"} placeholderTextColor="#8A8A8A" multiline style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]} />
              </View>
            ))}
            <PrimaryButton title="Add prescription entry" onPress={() => setEntries((current) => [...current, blankEntry(workoutType)])} />
          </View>

          <PrimaryButton title={saving ? "Saving…" : "Save template"} onPress={save} disabled={saving || !canPrescribe} />
        </>
      )}
    </FormScreen>
  );
}
