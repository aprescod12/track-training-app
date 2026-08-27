import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import { formatYMD } from "../../lib/date";
import {
  getAthleteAssignments,
  getCoachAssignments,
  type AthleteAssignment,
  type CoachAssignment,
} from "../../lib/training";
import {
  syncAthleteTrainingNotifications,
  syncCoachTrainingNotifications,
} from "../../lib/trainingNotifications";

function outcomeLabel(row: AthleteAssignment) {
  if (row.assignment_status === "cancelled") return "Cancelled";
  if (row.assignment_status === "closed" && !row.completion_status) return "Closed · No submission";
  switch (row.completion_status) {
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

function athleteLabel(row: CoachAssignment) {
  return row.athlete_full_name?.trim() || row.athlete_username?.trim() || "Athlete";
}

export default function TeamTrainingScreen() {
  const c = useAppColors();
  const [athleteRows, setAthleteRows] = useState<AthleteAssignment[]>([]);
  const [coachRows, setCoachRows] = useState<CoachAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const todayKey = useMemo(() => formatYMD(new Date()), []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [athlete, coach] = await Promise.all([
        getAthleteAssignments(),
        getCoachAssignments(),
      ]);
      setAthleteRows(athlete);
      setCoachRows(coach);

      void syncAthleteTrainingNotifications(athlete);
      void syncCoachTrainingNotifications(coach);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setAthleteRows([]);
      setCoachRows([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const coachToday = coachRows.filter((row) => row.scheduled_date === todayKey);
  const submittedToday = coachToday.filter((row) => row.submission_id).length;
  const unreviewedToday = coachToday.filter(
    (row) => row.submission_id && !row.reviewed_at
  ).length;

  return (
    <FormScreen refreshControlProps={{ refreshing, onRefresh }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
          Team Training
        </Text>
        <Text style={{ color: c.subtext }}>
          Scheduled team workouts, athlete submissions, and coach review.
        </Text>
      </View>

      {error && (
        <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>
      )}

      {coachRows.length > 0 && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
            Coach tools
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10 }}>
              <Text style={{ color: c.subtext }}>Assigned today</Text>
              <Text style={{ fontSize: 20, fontWeight: "900", color: c.text }}>{coachToday.length}</Text>
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10 }}>
              <Text style={{ color: c.subtext }}>Submitted</Text>
              <Text style={{ fontSize: 20, fontWeight: "900", color: c.text }}>{submittedToday}</Text>
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10 }}>
              <Text style={{ color: c.subtext }}>To review</Text>
              <Text style={{ fontSize: 20, fontWeight: "900", color: c.text }}>{unreviewedToday}</Text>
            </View>
          </View>
          <PrimaryButton
            title="Create workout template"
            onPress={() => router.push("/team-training/template-new")}
          />
          <PrimaryButton
            title="Assign workout"
            onPress={() => router.push("/team-training/assign")}
          />
        </View>
      )}

      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
          My assignments
        </Text>
        {athleteRows.length === 0 ? (
          <Text style={{ color: c.subtext }}>No team workouts are assigned to you.</Text>
        ) : (
          athleteRows.map((row) => (
            <Pressable
              key={row.assignment_recipient_id}
              onPress={() =>
                router.push(`/team-training/assignment/${row.assignment_recipient_id}`)
              }
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 12,
                padding: 12,
                gap: 4,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>
                  {row.title_snapshot}
                </Text>
                <Text style={{ color: c.subtext }}>{row.scheduled_date}</Text>
              </View>
              <Text style={{ color: c.subtext }}>
                {row.team_name ?? "Team"} · {outcomeLabel(row)}
              </Text>
              <Text style={{ color: c.text, fontWeight: "700" }}>View assignment →</Text>
            </Pressable>
          ))
        )}
      </View>

      {coachRows.length > 0 && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
            Coach dashboard
          </Text>
          {coachRows.map((row) => (
            <Pressable
              key={row.assignment_recipient_id}
              onPress={() =>
                router.push(`/team-training/assignment/${row.assignment_recipient_id}`)
              }
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 12,
                padding: 12,
                gap: 4,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>
                  {athleteLabel(row)}
                </Text>
                <Text style={{ color: c.subtext }}>{row.scheduled_date}</Text>
              </View>
              <Text style={{ color: c.text }}>{row.title_snapshot}</Text>
              <Text style={{ color: c.subtext }}>
                {outcomeLabel(row)}
                {row.submission_id && !row.reviewed_at ? " · Review needed" : ""}
              </Text>
              <Text style={{ color: c.text, fontWeight: "700" }}>Open →</Text>
            </Pressable>
          ))}
        </View>
      )}

      {athleteRows.length === 0 && coachRows.length === 0 && !error && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ color: c.text, fontWeight: "800" }}>No team training workspace yet</Text>
          <Text style={{ color: c.subtext }}>
            Team assignments will appear here once you are an assigned athlete or an explicitly authorized coach.
          </Text>
        </View>
      )}
    </FormScreen>
  );
}
