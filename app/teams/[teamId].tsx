import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Avatar from "../../components/Avatar";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { toAppError } from "../../lib/errors";
import {
  assignCoachToAthlete,
  createTeamGroup,
  endCoachAthleteAssignment,
  getTeamWorkspace,
  inviteTeamMember,
  setCoachTrainingScope,
  setTeamGroupMembership,
  updateTeamMemberRoleTitle,
  type TeamMember,
  type TeamMemberType,
  type TeamWorkspace,
  type TrainingWorkoutType,
} from "../../lib/teams";
import { useAppColors } from "../../lib/theme";

const memberTypeOptions: { value: TeamMemberType; label: string }[] = [
  { value: "athlete", label: "Athlete" },
  { value: "coach", label: "Coach" },
  { value: "staff", label: "Staff" },
];

const trainingScopes: { value: TrainingWorkoutType; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "jumps", label: "Jumps" },
  { value: "throws", label: "Throws" },
  { value: "lift", label: "Lift" },
];

function memberName(member: TeamMember) {
  return member.full_name?.trim() || member.username?.trim() || "Team member";
}

export default function TeamDetailScreen() {
  const c = useAppColors();
  const params = useLocalSearchParams<{ teamId?: string | string[] }>();
  const teamId = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
  const [workspace, setWorkspace] = useState<TeamWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteType, setInviteType] = useState<TeamMemberType>("athlete");
  const [groupName, setGroupName] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setError(null);
    try {
      const next = await getTeamWorkspace(teamId);
      setWorkspace(next);
      setRoleDrafts(
        Object.fromEntries(
          next.members
            .filter((member) => member.member_type === "coach")
            .map((member) => [member.membership_id, member.role_title ?? ""])
        )
      );
    } catch (error: unknown) {
      setWorkspace(null);
      setError(
        toAppError(error, {
          fallbackMessage: "Could not load this team. Pull to refresh and try again.",
        }).message
      );
    }
  }, [teamId]);

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

  const canManage =
    workspace?.myMembership.management_role === "owner" ||
    workspace?.myMembership.management_role === "admin";

  const coaches = useMemo(
    () => workspace?.members.filter((member) => member.member_type === "coach") ?? [],
    [workspace]
  );
  const athletes = useMemo(
    () => workspace?.members.filter((member) => member.member_type === "athlete") ?? [],
    [workspace]
  );

  async function runMutation(key: string, action: () => Promise<void>, fallbackMessage: string) {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (error: unknown) {
      setError(toAppError(error, { fallbackMessage }).message);
    } finally {
      setBusyKey(null);
    }
  }

  async function sendInvitation() {
    if (!teamId) return;
    await runMutation(
      "invite",
      async () => {
        await inviteTeamMember({ teamId, email: inviteEmail, memberType: inviteType });
        setInviteEmail("");
      },
      "Could not send the team invitation. Check the email and try again."
    );
  }

  async function addGroup() {
    if (!teamId) return;
    await runMutation(
      "create-group",
      async () => {
        await createTeamGroup({ teamId, name: groupName, groupType: "event_group" });
        setGroupName("");
      },
      "Could not create the training group. Please try again."
    );
  }

  async function toggleGroupMember(groupId: string, member: TeamMember) {
    if (!teamId || !workspace) return;
    const selected = workspace.groupMemberships.some(
      (row) => row.group_id === groupId && row.team_membership_id === member.membership_id
    );
    const key = `group:${groupId}:${member.membership_id}`;
    await runMutation(
      key,
      () =>
        setTeamGroupMembership({
          teamId,
          groupId,
          teamMembershipId: member.membership_id,
          enabled: !selected,
        }),
      "Could not update this group membership. Please try again."
    );
  }

  async function toggleTrainingScope(coach: TeamMember, workoutType: TrainingWorkoutType) {
    if (!teamId || !workspace) return;
    const permission = workspace.coachTrainingPermissions.find(
      (row) =>
        row.coach_membership_id === coach.membership_id && row.workout_type === workoutType
    );
    const selected = !!permission?.can_prescribe && !!permission?.can_review;
    const key = `scope:${coach.membership_id}:${workoutType}`;
    await runMutation(
      key,
      () =>
        setCoachTrainingScope({
          teamId,
          coachMembershipId: coach.membership_id,
          workoutType,
          enabled: !selected,
        }),
      "Could not update this coach's training authority. Please try again."
    );
  }

  async function saveRoleTitle(coach: TeamMember) {
    const key = `title:${coach.membership_id}`;
    await runMutation(
      key,
      () =>
        updateTeamMemberRoleTitle({
          membershipId: coach.membership_id,
          roleTitle: roleDrafts[coach.membership_id] ?? null,
        }),
      "Could not update the coaching title. Please try again."
    );
  }

  async function toggleCoaching(coach: TeamMember, athlete: TeamMember) {
    if (!teamId || !workspace) return;
    const existing = workspace.coachingAssignments.find(
      (row) =>
        row.coach_membership_id === coach.membership_id &&
        row.athlete_membership_id === athlete.membership_id &&
        row.active
    );
    const key = `athlete:${coach.membership_id}:${athlete.membership_id}`;
    await runMutation(
      key,
      async () => {
        if (existing) {
          await endCoachAthleteAssignment(existing.id);
        } else {
          await assignCoachToAthlete({
            teamId,
            coachMembershipId: coach.membership_id,
            athleteMembershipId: athlete.membership_id,
          });
        }
      },
      "Could not update athlete visibility. Please try again."
    );
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
    color: c.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  } as const;

  const sectionStyle = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  } as const;

  return (
    <FormScreen
      refreshControlProps={{ refreshing, onRefresh }}
      contentContainerStyle={{ width: "100%", maxWidth: 1040, alignSelf: "center" }}
    >
      {!workspace ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Team</Text>
          {error ? (
            <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>
          ) : (
            <Text style={{ color: c.subtext }}>Loading team…</Text>
          )}
        </View>
      ) : (
        <>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>
              {workspace.team.name}
            </Text>
            <Text style={{ color: c.subtext }}>
              {workspace.myMembership.member_type} · {workspace.myMembership.management_role} · {workspace.team.visibility}
            </Text>
            {!!workspace.team.description && (
              <Text style={{ color: c.subtext }}>{workspace.team.description}</Text>
            )}
          </View>

          {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}

          {canManage && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
                Add team member
              </Text>
              <Text style={{ color: c.subtext }}>
                Invite by account email. Membership does not create a friendship or grant training access.
              </Text>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="athlete@example.com"
                placeholderTextColor={c.subtext}
                style={inputStyle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {memberTypeOptions.map((option) => {
                  const selected = inviteType === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setInviteType(option.value)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? c.primary : c.border,
                        backgroundColor: selected ? c.primary : c.bg,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                      }}
                    >
                      <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <PrimaryButton
                title={busyKey === "invite" ? "Sending…" : "Send invitation"}
                onPress={busyKey === "invite" ? () => {} : sendInvitation}
              />
            </View>
          )}

          <View style={sectionStyle}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
              Roster · {workspace.members.length}
            </Text>
            {workspace.members.map((member) => (
              <View
                key={member.membership_id}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                  borderRadius: 12,
                  padding: 11,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Avatar uri={member.avatar_url} name={memberName(member)} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: c.text, fontWeight: "800" }}>{memberName(member)}</Text>
                  {!!member.username && <Text style={{ color: c.subtext }}>@{member.username}</Text>}
                  <Text style={{ color: c.subtext, textTransform: "capitalize" }}>
                    {member.role_title || member.member_type}
                    {member.management_role !== "member" ? ` · ${member.management_role}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={sectionStyle}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Training groups</Text>
            <Text style={{ color: c.subtext }}>
              Organize athletes and staff into groups such as Sprints, Distance, Jumps, or Throws. Sharing a group never grants a coach access to athlete training.
            </Text>
            {canManage && (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="e.g. Sprints"
                  placeholderTextColor={c.subtext}
                  style={inputStyle}
                />
                <PrimaryButton
                  title={busyKey === "create-group" ? "Creating…" : "Create group"}
                  onPress={busyKey === "create-group" ? () => {} : addGroup}
                />
              </View>
            )}
            {workspace.groups.length === 0 ? (
              <Text style={{ color: c.subtext }}>No training groups yet.</Text>
            ) : (
              workspace.groups.map((group) => {
                const selectedMembers = workspace.members.filter((member) =>
                  workspace.groupMemberships.some(
                    (row) =>
                      row.group_id === group.id && row.team_membership_id === member.membership_id
                  )
                );
                return (
                  <View
                    key={group.id}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      padding: 11,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: c.text, fontWeight: "800" }}>{group.name}</Text>
                    {canManage ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {workspace.members.map((member) => {
                          const selected = selectedMembers.some(
                            (selectedMember) =>
                              selectedMember.membership_id === member.membership_id
                          );
                          const key = `group:${group.id}:${member.membership_id}`;
                          return (
                            <Pressable
                              key={member.membership_id}
                              onPress={busyKey === key ? () => {} : () => toggleGroupMember(group.id, member)}
                              style={{
                                borderWidth: 1,
                                borderColor: selected ? c.primary : c.border,
                                backgroundColor: selected ? c.primary : c.card,
                                borderRadius: 999,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                              }}
                            >
                              <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}>
                                {busyKey === key ? "Updating…" : `${selected ? "✓ " : ""}${memberName(member)}`}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={{ color: c.subtext }}>
                        {selectedMembers.length
                          ? selectedMembers.map(memberName).join(", ")
                          : "No members assigned yet."}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </View>

          {coaches.length > 0 && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
                Coach responsibilities
              </Text>
              <Text style={{ color: c.subtext }}>
                Training authority controls which domains a coach may prescribe and formally review. Explicitly assigned coaches can still view all team-context training domains for their athletes.
              </Text>
              {coaches.map((coach) => {
                const coachGroups = workspace.groups.filter((group) =>
                  workspace.groupMemberships.some(
                    (row) =>
                      row.group_id === group.id && row.team_membership_id === coach.membership_id
                  )
                );
                return (
                  <View
                    key={coach.membership_id}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      padding: 12,
                      gap: 9,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Avatar uri={coach.avatar_url} name={memberName(coach)} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontWeight: "800" }}>{memberName(coach)}</Text>
                        <Text style={{ color: c.subtext }}>
                          {coachGroups.length ? coachGroups.map((group) => group.name).join(" · ") : "No group assigned"}
                        </Text>
                      </View>
                    </View>

                    {canManage ? (
                      <View style={{ gap: 7 }}>
                        <TextInput
                          value={roleDrafts[coach.membership_id] ?? ""}
                          onChangeText={(value) =>
                            setRoleDrafts((current) => ({ ...current, [coach.membership_id]: value }))
                          }
                          placeholder="e.g. Assistant Coach - Sprints"
                          placeholderTextColor={c.subtext}
                          style={inputStyle}
                        />
                        <Pressable
                          onPress={
                            busyKey === `title:${coach.membership_id}`
                              ? () => {}
                              : () => saveRoleTitle(coach)
                          }
                          style={{ alignSelf: "flex-start", paddingVertical: 4 }}
                        >
                          <Text style={{ color: c.primary, fontWeight: "800" }}>
                            {busyKey === `title:${coach.membership_id}` ? "Saving…" : "Save title"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      !!coach.role_title && <Text style={{ color: c.text }}>{coach.role_title}</Text>
                    )}

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {trainingScopes.map((scope) => {
                        const permission = workspace.coachTrainingPermissions.find(
                          (row) =>
                            row.coach_membership_id === coach.membership_id &&
                            row.workout_type === scope.value
                        );
                        const selected = !!permission?.can_prescribe && !!permission?.can_review;
                        const key = `scope:${coach.membership_id}:${scope.value}`;
                        return (
                          <Pressable
                            key={scope.value}
                            disabled={!canManage}
                            onPress={
                              !canManage || busyKey === key
                                ? () => {}
                                : () => toggleTrainingScope(coach, scope.value)
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: selected ? c.primary : c.border,
                              backgroundColor: selected ? c.primary : c.card,
                              borderRadius: 999,
                              paddingHorizontal: 13,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "800" }}>
                              {busyKey === key ? "Updating…" : `${selected ? "✓ " : ""}${scope.label}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={{ color: c.subtext, fontSize: 12 }}>
                      Selected domains allow prescription creation/changes and formal review. Athlete-owned workout logs remain read-only to coaches.
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {canManage && coaches.length > 0 && athletes.length > 0 && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
                Athlete visibility
              </Text>
              <Text style={{ color: c.subtext }}>
                Explicitly choose which athletes each coach may see. This is independent from groups and training authority. Once assigned, the coach may view that athlete’s team-context Running, Jumps, Throws, and Lift data, but may only prescribe or formally review enabled domains.
              </Text>
              {athletes.map((athlete) => (
                <View
                  key={athlete.membership_id}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 12,
                    padding: 11,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: c.text, fontWeight: "800" }}>{memberName(athlete)}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {coaches.map((coach) => {
                      const assignment = workspace.coachingAssignments.find(
                        (row) =>
                          row.active &&
                          row.coach_membership_id === coach.membership_id &&
                          row.athlete_membership_id === athlete.membership_id
                      );
                      const key = `athlete:${coach.membership_id}:${athlete.membership_id}`;
                      const selected = !!assignment;
                      return (
                        <Pressable
                          key={coach.membership_id}
                          onPress={busyKey === key ? () => {} : () => toggleCoaching(coach, athlete)}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? c.primary : c.border,
                            backgroundColor: selected ? c.primary : c.card,
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}>
                            {busyKey === key ? "Updating…" : `${selected ? "✓ " : ""}${memberName(coach)}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}

          {canManage && workspace.invitations.length > 0 && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
                Pending invitations
              </Text>
              {workspace.invitations.map((invitation) => (
                <View
                  key={invitation.id}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 12,
                    padding: 10,
                    gap: 2,
                  }}
                >
                  <Text style={{ color: c.text, fontWeight: "700" }}>
                    {invitation.email ?? "Invited account"}
                  </Text>
                  <Text style={{ color: c.subtext, textTransform: "capitalize" }}>
                    {invitation.member_type} · pending
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </FormScreen>
  );
}
