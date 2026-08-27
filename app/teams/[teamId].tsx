import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Avatar from "../../components/Avatar";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { toAppError } from "../../lib/errors";
import {
  assignCoachToAthlete,
  endCoachAthleteAssignment,
  getTeamWorkspace,
  inviteTeamMember,
  type TeamMember,
  type TeamMemberType,
  type TeamWorkspace,
} from "../../lib/teams";
import { useAppColors } from "../../lib/theme";

const memberTypeOptions: { value: TeamMemberType; label: string }[] = [
  { value: "athlete", label: "Athlete" },
  { value: "coach", label: "Coach" },
  { value: "staff", label: "Staff" },
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
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setError(null);
    try {
      setWorkspace(await getTeamWorkspace(teamId));
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

  async function sendInvitation() {
    if (!teamId) return;
    setBusyKey("invite");
    setError(null);
    try {
      await inviteTeamMember({ teamId, email: inviteEmail, memberType: inviteType });
      setInviteEmail("");
      await load();
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not send the team invitation. Check the email and try again.",
        }).message
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleCoaching(coach: TeamMember, athlete: TeamMember) {
    if (!teamId || !workspace) return;
    const existing = workspace.coachingAssignments.find(
      (row) =>
        row.coach_membership_id === coach.membership_id &&
        row.athlete_membership_id === athlete.membership_id &&
        row.active
    );
    const key = `${coach.membership_id}:${athlete.membership_id}`;
    setBusyKey(key);
    setError(null);
    try {
      if (existing) {
        await endCoachAthleteAssignment(existing.id);
      } else {
        await assignCoachToAthlete({
          teamId,
          coachMembershipId: coach.membership_id,
          athleteMembershipId: athlete.membership_id,
        });
      }
      await load();
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not update coaching access. Please try again.",
        }).message
      );
    } finally {
      setBusyKey(null);
    }
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
                Add team member
              </Text>
              <Text style={{ color: c.subtext }}>
                Invite by account email. Membership does not automatically create a friendship or grant a coach access to athlete training.
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
                      <Text
                        style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}
                      >
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
                  {!!member.username && (
                    <Text style={{ color: c.subtext }}>@{member.username}</Text>
                  )}
                  <Text style={{ color: c.subtext, textTransform: "capitalize" }}>
                    {member.member_type}
                    {member.management_role !== "member" ? ` · ${member.management_role}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {canManage && coaches.length > 0 && athletes.length > 0 && (
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
                Coaching access
              </Text>
              <Text style={{ color: c.subtext }}>
                Explicitly authorize which coaches are assigned to which athletes. This is separate from team membership and is required for team-context training access.
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
                      const key = `${coach.membership_id}:${athlete.membership_id}`;
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
                          <Text
                            style={{
                              color: selected ? c.primaryText : c.text,
                              fontWeight: "700",
                            }}
                          >
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
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 8,
              }}
            >
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
