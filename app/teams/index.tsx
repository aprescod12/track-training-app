import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { toAppError } from "../../lib/errors";
import {
  acceptTeamInvitation,
  getMyPendingTeamInvitations,
  getMyTeams,
  type MyTeam,
  type TeamInvitation,
} from "../../lib/teams";
import { useAppColors } from "../../lib/theme";

function roleLabel(team: MyTeam) {
  const member = team.member_type.charAt(0).toUpperCase() + team.member_type.slice(1);
  if (team.management_role === "member") return member;
  const management =
    team.management_role.charAt(0).toUpperCase() + team.management_role.slice(1);
  return `${member} · ${management}`;
}

export default function TeamsScreen() {
  const c = useAppColors();
  const [teams, setTeams] = useState<MyTeam[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [myTeams, pending] = await Promise.all([
        getMyTeams(),
        getMyPendingTeamInvitations(),
      ]);
      setTeams(myTeams);
      setInvitations(pending);
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not load your teams. Pull to refresh and try again.",
        }).message
      );
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

  async function accept(invitation: TeamInvitation) {
    setAcceptingId(invitation.id);
    setError(null);
    try {
      await acceptTeamInvitation(invitation.id);
      await load();
      router.push(`/teams/${invitation.team_id}`);
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not accept the team invitation. Please try again.",
        }).message
      );
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <FormScreen
      refreshControlProps={{ refreshing, onRefresh }}
      contentContainerStyle={{ width: "100%", maxWidth: 980, alignSelf: "center" }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <View style={{ gap: 4, flex: 1, minWidth: 220 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Teams</Text>
          <Text style={{ color: c.subtext }}>
            Create teams, manage rosters, and control explicit coach-athlete access.
          </Text>
        </View>
        <PrimaryButton title="Create team" onPress={() => router.push("/teams/new")} />
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}

      {invitations.length > 0 && (
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
            Invitations
          </Text>
          {invitations.map((invitation) => (
            <View
              key={invitation.id}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 12,
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "800" }}>
                {invitation.team_name ?? "Private team invitation"}
              </Text>
              <Text style={{ color: c.subtext }}>
                Join as {invitation.member_type}
              </Text>
              <PrimaryButton
                title={acceptingId === invitation.id ? "Accepting…" : "Accept invitation"}
                onPress={
                  acceptingId === invitation.id ? () => {} : () => accept(invitation)
                }
              />
            </View>
          ))}
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
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>My teams</Text>
        {teams.length === 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.subtext }}>
              You do not have an active team membership yet.
            </Text>
            <PrimaryButton title="Create your first team" onPress={() => router.push("/teams/new")} />
          </View>
        ) : (
          teams.map((team) => (
            <Pressable
              key={team.team_id}
              onPress={() => router.push(`/teams/${team.team_id}`)}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 12,
                padding: 12,
                gap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>
                  {team.team_name}
                </Text>
                <Text style={{ color: c.subtext, textTransform: "capitalize" }}>
                  {team.visibility}
                </Text>
              </View>
              <Text style={{ color: c.subtext }}>{roleLabel(team)}</Text>
              {!!team.description && (
                <Text numberOfLines={2} style={{ color: c.subtext }}>
                  {team.description}
                </Text>
              )}
              <Text style={{ color: c.text, fontWeight: "700" }}>Open team →</Text>
            </Pressable>
          ))
        )}
      </View>
    </FormScreen>
  );
}
