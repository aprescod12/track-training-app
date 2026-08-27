import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import FormScreen from "../../../components/FormScreen";
import PrimaryButton from "../../../components/PrimaryButton";
import { useAppColors } from "../../../lib/theme";
import {
  getAssignmentEntries,
  getAthleteAssignment,
  getCoachAssignment,
  reviewWorkoutAssignmentSubmission,
  submitWorkoutAssignment,
  type AssignmentEntry,
  type AthleteAssignment,
  type CoachAssignment,
  type UnavailableReason,
} from "../../../lib/training";
import {
  attachWorkoutToAssignment,
  getPersonalWorkoutCandidates,
  type PersonalWorkoutCandidate,
} from "../../../lib/assignmentAttachment";

function outcomeLabel(status: string | null) {
  switch (status) {
    case "completed":
      return "Completed";
    case "partially_completed":
      return "Partially completed";
    case "modified":
      return "Modified";
    case "skipped":
      return "Skipped";
    case "unavailable":
      return "Unavailable";
    default:
      return "Not submitted";
  }
}

function prescriptionLine(entry: AssignmentEntry) {
  const parts: string[] = [];
  if (entry.sets) parts.push(`${entry.sets} sets`);
  if (entry.reps) parts.push(`${entry.reps} reps`);
  if (entry.distance_m !== null) parts.push(`${entry.distance_m}m`);
  if (entry.target_time_text) parts.push(`target ${entry.target_time_text}`);
  if (entry.target_weight !== null) parts.push(`target ${entry.target_weight}`);
  if (entry.recovery_seconds !== null) parts.push(`${entry.recovery_seconds}s recovery`);
  if (entry.intensity_text) parts.push(entry.intensity_text);
  return parts.join(" · ");
}

export default function TeamTrainingAssignmentScreen() {
  const c = useAppColors();
  const { recipientId } = useLocalSearchParams<{ recipientId: string }>();
  const id = typeof recipientId === "string" ? recipientId : "";

  const [athleteRow, setAthleteRow] = useState<AthleteAssignment | null>(null);
  const [coachRow, setCoachRow] = useState<CoachAssignment | null>(null);
  const [entries, setEntries] = useState<AssignmentEntry[]>([]);
  const [personalWorkouts, setPersonalWorkouts] = useState<PersonalWorkoutCandidate[]>([]);
  const [athleteNote, setAthleteNote] = useState("");
  const [coachNote, setCoachNote] = useState("");
  const [unavailableReason, setUnavailableReason] = useState<UnavailableReason>("injury");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const own = await getAthleteAssignment(id);
      if (own) {
        setAthleteRow(own);
        setCoachRow(null);
        setAthleteNote(own.athlete_note ?? "");
        if (own.unavailable_reason) setUnavailableReason(own.unavailable_reason);
        const [assignmentEntries, candidates] = await Promise.all([
          getAssignmentEntries(own.assignment_id),
          getPersonalWorkoutCandidates(own.scheduled_date),
        ]);
        setEntries(assignmentEntries);
        setPersonalWorkouts(candidates);
      } else {
        const coach = await getCoachAssignment(id);
        setCoachRow(coach);
        setAthleteRow(null);
        setPersonalWorkouts([]);
        setCoachNote(coach?.coach_note ?? "");
        setEntries(coach ? await getAssignmentEntries(coach.assignment_id) : []);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setAthleteRow(null);
      setCoachRow(null);
      setEntries([]);
      setPersonalWorkouts([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const row = athleteRow ?? coachRow;
  const assignmentOpen = row?.assignment_status === "scheduled";

  async function submitSimple(
    completionStatus: "skipped" | "unavailable",
    reason?: UnavailableReason
  ) {
    if (!athleteRow) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await submitWorkoutAssignment({
        recipientId: athleteRow.assignment_recipient_id,
        completionStatus,
        unavailableReason: completionStatus === "unavailable" ? reason ?? unavailableReason : null,
        athleteNote,
      });
      setMessage("Assignment response saved.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function attachPerformance(
    workoutId: string,
    completionStatus: "completed" | "partially_completed" | "modified"
  ) {
    if (!athleteRow) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await attachWorkoutToAssignment({
        recipientId: athleteRow.assignment_recipient_id,
        workoutId,
        completionStatus,
        athleteNote,
      });
      setMessage("Workout attached to the team assignment.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function review() {
    if (!coachRow?.submission_id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await reviewWorkoutAssignmentSubmission({
        submissionId: coachRow.submission_id,
        coachNote,
      });
      setMessage("Submission reviewed.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <FormScreen>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: c.text }}>Loading assignment…</Text>
        </View>
      </FormScreen>
    );
  }

  if (!row) {
    return (
      <FormScreen>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Assignment</Text>
        <Text style={{ color: c.subtext }}>
          This assignment is not available to your current account or coaching authorization.
        </Text>
        {error && <Text style={{ color: "#ef4444" }}>{error}</Text>}
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
          {row.title_snapshot}
        </Text>
        <Text style={{ color: c.subtext }}>
          {row.team_name ?? "Team"} · {row.scheduled_date} · {row.workout_type_snapshot === "lift" ? "Lift" : "Track"}
        </Text>
        {coachRow && (
          <Text style={{ color: c.text, fontWeight: "700" }}>
            Athlete: {coachRow.athlete_full_name || coachRow.athlete_username || "Athlete"}
          </Text>
        )}
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}
      {message && <Text style={{ color: c.text, fontWeight: "700" }}>{message}</Text>}

      <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Prescription</Text>
        {!!row.instructions && <Text style={{ color: c.text }}>{row.instructions}</Text>}
        {entries.map((entry) => (
          <View key={entry.id} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 12, padding: 12, gap: 4 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>
              {entry.label || entry.exercise_name_snapshot}
            </Text>
            {entry.label && <Text style={{ color: c.subtext }}>{entry.exercise_name_snapshot}</Text>}
            {!!prescriptionLine(entry) && <Text style={{ color: c.subtext }}>{prescriptionLine(entry)}</Text>}
            {!!entry.notes && <Text style={{ color: c.text }}>{entry.notes}</Text>}
          </View>
        ))}
      </View>

      <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Status</Text>
        <Text style={{ color: c.text }}>
          Assignment: {row.assignment_status} · Response: {outcomeLabel(row.completion_status)}
        </Text>
        {row.unavailable_reason && (
          <Text style={{ color: c.subtext }}>Unavailable reason: {row.unavailable_reason}</Text>
        )}
        {row.reviewed_at && <Text style={{ color: c.subtext }}>Coach reviewed</Text>}
        {row.coach_note && <Text style={{ color: c.text }}>Coach note: {row.coach_note}</Text>}
      </View>

      {athleteRow && (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Report your workout</Text>
          {!assignmentOpen ? (
            <Text style={{ color: c.subtext }}>
              This assignment is {athleteRow.assignment_status}; normal submissions are closed.
            </Text>
          ) : (
            <>
              <TextInput
                value={athleteNote}
                onChangeText={setAthleteNote}
                placeholder="Optional note for your coach"
                placeholderTextColor="#8A8A8A"
                multiline
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12, minHeight: 72, textAlignVertical: "top" }}
              />

              <PrimaryButton
                title="Log a workout for this assignment date"
                onPress={() => router.push(`/modal?date=${athleteRow.scheduled_date}`)}
                disabled={saving}
              />

              {personalWorkouts.length === 0 ? (
                <Text style={{ color: c.subtext }}>
                  After logging a workout for {athleteRow.scheduled_date}, return here and attach it. It remains personal until you explicitly attach it.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "800", color: c.text }}>Attach a personal workout</Text>
                  {personalWorkouts.map((workout) => (
                    <View key={workout.id} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, borderRadius: 12, padding: 10, gap: 7 }}>
                      <Text style={{ fontWeight: "800", color: c.text }}>{workout.title}</Text>
                      <Text style={{ color: c.subtext }}>{workout.workout_type === "lift" ? "Lift" : "Track"} · currently personal</Text>
                      <PrimaryButton title="Attach as completed" onPress={() => attachPerformance(workout.id, "completed")} disabled={saving} />
                      <PrimaryButton title="Attach as partially completed" onPress={() => attachPerformance(workout.id, "partially_completed")} disabled={saving} />
                      <PrimaryButton title="Attach as modified" onPress={() => attachPerformance(workout.id, "modified")} disabled={saving} />
                    </View>
                  ))}
                </View>
              )}

              <PrimaryButton title="Skipped" onPress={() => submitSimple("skipped")} disabled={saving} />

              <Text style={{ fontWeight: "800", color: c.text, marginTop: 4 }}>Unavailable</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["injury", "illness", "other"] as UnavailableReason[]).map((reason) => (
                  <Pressable
                    key={reason}
                    onPress={() => setUnavailableReason(reason)}
                    style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, alignItems: "center", backgroundColor: unavailableReason === reason ? c.primary : c.bg }}
                  >
                    <Text style={{ color: unavailableReason === reason ? c.primaryText : c.text, fontWeight: "700" }}>
                      {reason[0].toUpperCase() + reason.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <PrimaryButton title="Report unavailable" onPress={() => submitSimple("unavailable", unavailableReason)} disabled={saving} />
            </>
          )}
          {athleteRow.workout_id && (
            <PrimaryButton title="View linked workout" onPress={() => router.push(`/workout/${athleteRow.workout_id}`)} />
          )}
        </View>
      )}

      {coachRow && (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Coach review</Text>
          {!coachRow.submission_id ? (
            <Text style={{ color: c.subtext }}>No athlete submission yet.</Text>
          ) : (
            <>
              <Text style={{ color: c.text }}>Outcome: {outcomeLabel(coachRow.completion_status)}</Text>
              {coachRow.athlete_note && <Text style={{ color: c.text }}>Athlete note: {coachRow.athlete_note}</Text>}
              {coachRow.workout_id && (
                <PrimaryButton title="View athlete performance" onPress={() => router.push(`/workout/${coachRow.workout_id}`)} />
              )}
              <TextInput
                value={coachNote}
                onChangeText={setCoachNote}
                placeholder="Optional coach review note"
                placeholderTextColor="#8A8A8A"
                multiline
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12, minHeight: 72, textAlignVertical: "top" }}
              />
              <PrimaryButton title={coachRow.reviewed_at ? "Update review" : "Mark reviewed"} onPress={review} disabled={saving} />
            </>
          )}
        </View>
      )}
    </FormScreen>
  );
}
