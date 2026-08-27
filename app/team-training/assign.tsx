import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import { formatYMD } from "../../lib/date";
import { toAppError } from "../../lib/errors";
import {
  createWorkoutAssignment,
  getActiveCoachTeams,
  getCoachAthletes,
  getTeamGroups,
  getWorkoutTemplates,
  type CoachAthlete,
  type CoachTeam,
  type TeamGroup,
  type WorkoutTemplate,
} from "../../lib/training";
import {
  coachHasTrainingPermission,
  getMyCoachTrainingPermissions,
} from "../../lib/teams";

type TargetMode = "athletes" | "group" | "team";

export default function AssignWorkoutScreen() {
  const c = useAppColors();
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [viewOnlyTemplateCount, setViewOnlyTemplateCount] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [athletes, setAthletes] = useState<CoachAthlete[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [targetMode, setTargetMode] = useState<TargetMode>("athletes");
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [groupId, setGroupId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => formatYMD(new Date()));
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    try {
      const rows = await getActiveCoachTeams();
      setTeams(rows);
      setTeamId((current) => current || rows[0]?.team_id || "");
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not load your coach teams. Please try again.",
        }).message
      );
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (!teamId) {
      setTemplates([]);
      setViewOnlyTemplateCount(0);
      setAthletes([]);
      setGroups([]);
      return;
    }

    let cancelled = false;
    setLoadingOptions(true);
    setError(null);
    Promise.all([
      getWorkoutTemplates(teamId),
      getCoachAthletes(teamId),
      getTeamGroups(teamId),
      getMyCoachTrainingPermissions(teamId),
    ])
      .then(([templateRows, athleteRows, groupRows, permissions]) => {
        if (cancelled) return;
        const permittedTemplates = templateRows.filter((template) =>
          coachHasTrainingPermission(permissions, template.workout_type, "prescribe")
        );
        setTemplates(permittedTemplates);
        setViewOnlyTemplateCount(templateRows.length - permittedTemplates.length);
        setTemplateId(permittedTemplates[0]?.id ?? "");
        setAthletes(athleteRows);
        setGroups(groupRows);
        setGroupId(groupRows[0]?.id ?? "");
        setSelectedAthletes([]);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(
            toAppError(error, {
              fallbackMessage: "Could not load assignment options for this team. Please try again.",
            }).message
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  function toggleAthlete(membershipId: string) {
    setSelectedAthletes((current) =>
      current.includes(membershipId)
        ? current.filter((id) => id !== membershipId)
        : [...current, membershipId]
    );
  }

  async function assign() {
    if (!teamId || !templateId || !scheduledDate.trim()) {
      setError("Team, authorized template, and scheduled date are required.");
      return;
    }
    if (targetMode === "athletes" && selectedAthletes.length === 0) {
      setError("Select at least one athlete.");
      return;
    }
    if (targetMode === "group" && !groupId) {
      setError("Select a group.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createWorkoutAssignment({
        teamId,
        templateId,
        scheduledDate: scheduledDate.trim(),
        instructions,
        targetTeam: targetMode === "team",
        groupIds: targetMode === "group" ? [groupId] : [],
        athleteMembershipIds: targetMode === "athletes" ? selectedAthletes : [],
      });
      router.replace("/team-training");
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not create the assignment. Check the recipients and your training authority, then try again.",
        }).message
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Assign workout</Text>
        <Text style={{ color: c.subtext }}>
          Assign only within your Track/Lift authority and only to athletes explicitly assigned to you.
        </Text>
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}

      {teams.length === 0 ? (
        <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14 }}>
          <Text style={{ color: c.subtext }}>No active coach team is available.</Text>
        </View>
      ) : (
        <>
          <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Team</Text>
            {teams.map((team) => (
              <Pressable key={team.team_id} onPress={() => setTeamId(team.team_id)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, backgroundColor: teamId === team.team_id ? c.primary : c.bg }}>
                <Text style={{ color: teamId === team.team_id ? c.primaryText : c.text, fontWeight: "700" }}>{team.team_name}</Text>
              </Pressable>
            ))}

            <Text style={{ fontWeight: "800", color: c.text }}>Template</Text>
            {templates.length === 0 ? (
              <Text style={{ color: c.subtext }}>
                {loadingOptions
                  ? "Loading templates…"
                  : viewOnlyTemplateCount > 0
                    ? "This team has templates, but none are in a training domain you are authorized to prescribe."
                    : "Create an authorized template before assigning training."}
              </Text>
            ) : (
              templates.map((template) => (
                <Pressable key={template.id} onPress={() => setTemplateId(template.id)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, backgroundColor: templateId === template.id ? c.primary : c.bg }}>
                  <Text style={{ color: templateId === template.id ? c.primaryText : c.text, fontWeight: "700" }}>{template.title}</Text>
                  <Text style={{ color: templateId === template.id ? c.primaryText : c.subtext }}>{template.workout_type === "lift" ? "Lift" : "Track"}</Text>
                </Pressable>
              ))
            )}
            {viewOnlyTemplateCount > 0 && templates.length > 0 && (
              <Text style={{ color: c.subtext, fontSize: 12 }}>
                {viewOnlyTemplateCount} template{viewOnlyTemplateCount === 1 ? " is" : "s are"} hidden here because you have view-only access to that training domain.
              </Text>
            )}

            <Text style={{ fontWeight: "800", color: c.text }}>Scheduled date</Text>
            <TextInput value={scheduledDate} onChangeText={setScheduledDate} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor="#8A8A8A" style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12 }} />
            <TextInput value={instructions} onChangeText={setInstructions} placeholder="Coach instructions (optional)" placeholderTextColor="#8A8A8A" multiline style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, borderRadius: 12, padding: 12, minHeight: 72, textAlignVertical: "top" }} />
          </View>

          <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Recipients</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["athletes", "group", "team"] as TargetMode[]).map((mode) => (
                <Pressable key={mode} onPress={() => setTargetMode(mode)} style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 9, alignItems: "center", backgroundColor: targetMode === mode ? c.primary : c.bg }}>
                  <Text style={{ color: targetMode === mode ? c.primaryText : c.text, fontWeight: "700" }}>
                    {mode === "athletes" ? "Athletes" : mode === "group" ? "Group" : "Full team"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {targetMode === "athletes" && (
              <>
                {athletes.length === 0 ? (
                  <Text style={{ color: c.subtext }}>No athletes currently have an explicit coaching assignment to you.</Text>
                ) : (
                  athletes.map((athlete) => {
                    const selected = selectedAthletes.includes(athlete.membership_id);
                    return (
                      <Pressable key={athlete.membership_id} onPress={() => toggleAthlete(athlete.membership_id)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, backgroundColor: selected ? c.primary : c.bg }}>
                        <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}>{athlete.display_name}</Text>
                      </Pressable>
                    );
                  })
                )}
              </>
            )}

            {targetMode === "group" && (
              <>
                {groups.length === 0 ? (
                  <Text style={{ color: c.subtext }}>No active team groups are available.</Text>
                ) : (
                  groups.map((group) => (
                    <Pressable key={group.id} onPress={() => setGroupId(group.id)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, backgroundColor: groupId === group.id ? c.primary : c.bg }}>
                      <Text style={{ color: groupId === group.id ? c.primaryText : c.text, fontWeight: "700" }}>{group.name}</Text>
                    </Pressable>
                  ))
                )}
                <Text style={{ color: c.subtext }}>
                  Group membership expands at assignment time. The database rejects the entire assignment if any athlete in the group is not explicitly assigned to you.
                </Text>
              </>
            )}

            {targetMode === "team" && (
              <Text style={{ color: c.subtext }}>
                Full-team targeting expands every active athlete at assignment time and succeeds only when you are explicitly authorized for every recipient.
              </Text>
            )}
          </View>

          <PrimaryButton title={saving ? "Assigning…" : "Create assignment"} onPress={assign} disabled={saving || !templateId} />
        </>
      )}
    </FormScreen>
  );
}
