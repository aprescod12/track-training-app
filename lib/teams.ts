import { AppError } from "./errors";
import { supabase } from "./supabase";
import {
  normalizeTrainingDomain,
  type TrainingDomain,
} from "./trainingDomains";

const db = supabase as any;

export type TeamMemberType = "athlete" | "coach" | "staff";
export type TeamManagementRole = "member" | "admin" | "owner";
export type TeamVisibility = "public" | "unlisted" | "private";
export type TrainingWorkoutType = TrainingDomain;

export type MyTeam = {
  membership_id: string;
  team_id: string;
  team_name: string;
  slug: string;
  description: string | null;
  visibility: TeamVisibility;
  organization_id: string | null;
  member_type: TeamMemberType;
  management_role: TeamManagementRole;
};

export type TeamMember = {
  membership_id: string;
  team_id: string;
  user_id: string;
  member_type: TeamMemberType;
  management_role: TeamManagementRole;
  role_title: string | null;
  status: "pending" | "active" | "inactive" | "removed";
  joined_at: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type TeamInvitation = {
  id: string;
  team_id: string;
  team_name: string | null;
  email: string | null;
  invited_user_id: string | null;
  member_type: TeamMemberType;
  management_role: TeamManagementRole;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  expires_at: string | null;
  created_at: string;
};

export type CoachingAssignment = {
  id: string;
  team_id: string;
  coach_membership_id: string;
  athlete_membership_id: string;
  is_primary: boolean;
  active: boolean;
};

export type TeamGroup = {
  id: string;
  team_id: string;
  name: string;
  group_type: string | null;
  parent_group_id: string | null;
  sort_order: number | null;
  is_active: boolean;
};

export type TeamGroupMembership = {
  team_id: string;
  group_id: string;
  team_membership_id: string;
};

export type CoachTrainingPermission = {
  team_id: string;
  coach_membership_id: string;
  workout_type: TrainingWorkoutType;
  can_prescribe: boolean;
  can_review: boolean;
};

export type TeamWorkspace = {
  team: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    visibility: TeamVisibility;
    organization_id: string | null;
  };
  myMembership: TeamMember;
  members: TeamMember[];
  invitations: TeamInvitation[];
  coachingAssignments: CoachingAssignment[];
  groups: TeamGroup[];
  groupMemberships: TeamGroupMembership[];
  coachTrainingPermissions: CoachTrainingPermission[];
};

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) {
    throw new AppError({
      kind: "auth",
      code: "not_authenticated",
      message: "Please sign in to continue.",
    });
  }
  return data.user;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function slugifyTeamName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function coachHasTrainingPermission(
  permissions: CoachTrainingPermission[],
  workoutType: TrainingWorkoutType,
  capability: "prescribe" | "review"
) {
  const row = permissions.find((permission) => permission.workout_type === workoutType);
  if (!row) return false;
  return capability === "prescribe" ? row.can_prescribe : row.can_review;
}

export async function getMyTeams(): Promise<MyTeam[]> {
  const user = await requireUser();
  const { data, error } = await db
    .from("team_memberships")
    .select(
      "id, team_id, member_type, management_role, status, teams(id, name, slug, description, visibility, organization_id)"
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).flatMap((row: any) => {
    const team = relationOne<any>(row.teams);
    if (!team) return [];
    return [
      {
        membership_id: row.id,
        team_id: row.team_id,
        team_name: team.name,
        slug: team.slug,
        description: team.description ?? null,
        visibility: team.visibility,
        organization_id: team.organization_id ?? null,
        member_type: row.member_type,
        management_role: row.management_role,
      } satisfies MyTeam,
    ];
  });
}

export async function createTeam(input: {
  name: string;
  slug: string;
  memberType: TeamMemberType;
  description?: string;
  visibility?: TeamVisibility;
}) {
  await requireUser();
  const name = input.name.trim();
  const slug = slugifyTeamName(input.slug);

  if (!name) {
    throw new AppError({ kind: "validation", message: "Team name is required." });
  }
  if (!slug) {
    throw new AppError({ kind: "validation", message: "Team URL name is required." });
  }

  const { data, error } = await db.rpc("create_team", {
    p_name: name,
    p_slug: slug,
    p_member_type: input.memberType,
    p_organization_id: null,
    p_description: input.description?.trim() || null,
    p_city: null,
    p_state_region: null,
    p_country: null,
    p_visibility: input.visibility ?? "private",
  });

  if (error) throw error;
  return data as string;
}

export async function getMyPendingTeamInvitations(): Promise<TeamInvitation[]> {
  const user = await requireUser();
  const email = user.email?.trim().toLowerCase() ?? "";
  const { data, error } = await db
    .from("team_invitations")
    .select(
      "id, team_id, email, invited_user_id, member_type, management_role, status, expires_at, created_at, teams(name)"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter((row: any) => {
      if (row.invited_user_id === user.id) return true;
      return !!email && typeof row.email === "string" && row.email.trim().toLowerCase() === email;
    })
    .map((row: any) => ({
      id: row.id,
      team_id: row.team_id,
      team_name: relationOne<any>(row.teams)?.name ?? null,
      email: row.email ?? null,
      invited_user_id: row.invited_user_id ?? null,
      member_type: row.member_type,
      management_role: row.management_role,
      status: row.status,
      expires_at: row.expires_at ?? null,
      created_at: row.created_at,
    }));
}

export async function acceptTeamInvitation(invitationId: string) {
  await requireUser();
  const { data, error } = await db.rpc("accept_team_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
  return data as string;
}

export async function inviteTeamMember(input: {
  teamId: string;
  email: string;
  memberType: TeamMemberType;
}) {
  const user = await requireUser();
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AppError({
      kind: "validation",
      message: "Enter a valid email address for the team member.",
    });
  }

  const { data, error } = await db
    .from("team_invitations")
    .insert({
      team_id: input.teamId,
      email,
      invited_user_id: null,
      member_type: input.memberType,
      management_role: "member",
      invited_by: user.id,
      status: "pending",
      token_hash: null,
      expires_at: null,
      accepted_at: null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function getTeamWorkspace(teamId: string): Promise<TeamWorkspace> {
  const user = await requireUser();

  const [teamRes, membershipRes, membersRes, groupsRes, groupMembershipsRes] = await Promise.all([
    db
      .from("teams")
      .select("id, name, slug, description, visibility, organization_id")
      .eq("id", teamId)
      .single(),
    db
      .from("team_memberships")
      .select("id, team_id, user_id, member_type, management_role, role_title, status, joined_at")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single(),
    db
      .from("team_memberships")
      .select("id, team_id, user_id, member_type, management_role, role_title, status, joined_at")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    db
      .from("team_groups")
      .select("id, team_id, name, group_type, parent_group_id, sort_order, is_active")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("team_group_memberships")
      .select("team_id, group_id, team_membership_id")
      .eq("team_id", teamId),
  ]);

  if (teamRes.error) throw teamRes.error;
  if (membershipRes.error) throw membershipRes.error;
  if (membersRes.error) throw membersRes.error;
  if (groupsRes.error) throw groupsRes.error;
  if (groupMembershipsRes.error) throw groupMembershipsRes.error;

  const rows = membersRes.data ?? [];
  const userIds = Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)));
  const profileMap = new Map<string, any>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    for (const profile of profiles ?? []) profileMap.set(profile.id, profile);
  }

  const mapMember = (row: any): TeamMember => {
    const profile = profileMap.get(row.user_id);
    return {
      membership_id: row.id,
      team_id: row.team_id,
      user_id: row.user_id,
      member_type: row.member_type,
      management_role: row.management_role,
      role_title: row.role_title ?? null,
      status: row.status,
      joined_at: row.joined_at ?? null,
      full_name: profile?.full_name ?? null,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  };

  const members = rows.map(mapMember);
  const myMembership = members.find((member: TeamMember) => member.user_id === user.id);
  if (!myMembership) {
    throw new AppError({
      kind: "permission",
      message: "You do not have an active membership on this team.",
    });
  }

  const isAdmin = ["owner", "admin"].includes(myMembership.management_role);
  const [invitationsRes, coachingRes, permissionsRes] = await Promise.all([
    isAdmin
      ? db
          .from("team_invitations")
          .select(
            "id, team_id, email, invited_user_id, member_type, management_role, status, expires_at, created_at"
          )
          .eq("team_id", teamId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    db
      .from("coach_athlete_assignments")
      .select("id, team_id, coach_membership_id, athlete_membership_id, is_primary, active")
      .eq("team_id", teamId)
      .eq("active", true),
    db
      .from("coach_training_permissions")
      .select("team_id, coach_membership_id, workout_type, can_prescribe, can_review")
      .eq("team_id", teamId),
  ]);

  if (invitationsRes.error) throw invitationsRes.error;
  if (coachingRes.error) throw coachingRes.error;
  if (permissionsRes.error) throw permissionsRes.error;

  return {
    team: {
      id: teamRes.data.id,
      name: teamRes.data.name,
      slug: teamRes.data.slug,
      description: teamRes.data.description ?? null,
      visibility: teamRes.data.visibility,
      organization_id: teamRes.data.organization_id ?? null,
    },
    myMembership,
    members,
    invitations: (invitationsRes.data ?? []).map((row: any) => ({
      id: row.id,
      team_id: row.team_id,
      team_name: teamRes.data.name,
      email: row.email ?? null,
      invited_user_id: row.invited_user_id ?? null,
      member_type: row.member_type,
      management_role: row.management_role,
      status: row.status,
      expires_at: row.expires_at ?? null,
      created_at: row.created_at,
    })),
    coachingAssignments: (coachingRes.data ?? []) as CoachingAssignment[],
    groups: (groupsRes.data ?? []) as TeamGroup[],
    groupMemberships: (groupMembershipsRes.data ?? []) as TeamGroupMembership[],
    coachTrainingPermissions: (permissionsRes.data ?? []).map((row: any) => ({
      team_id: row.team_id,
      coach_membership_id: row.coach_membership_id,
      workout_type: normalizeTrainingDomain(row.workout_type),
      can_prescribe: !!row.can_prescribe,
      can_review: !!row.can_review,
    })) as CoachTrainingPermission[],
  };
}

export async function createTeamGroup(input: {
  teamId: string;
  name: string;
  groupType?: string | null;
}) {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) {
    throw new AppError({ kind: "validation", message: "Group name is required." });
  }

  const { data, error } = await db
    .from("team_groups")
    .insert({
      team_id: input.teamId,
      name,
      group_type: input.groupType?.trim() || "training",
      parent_group_id: null,
      sort_order: null,
      is_active: true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function setTeamGroupMembership(input: {
  teamId: string;
  groupId: string;
  teamMembershipId: string;
  enabled: boolean;
}) {
  await requireUser();

  if (input.enabled) {
    const { error } = await db.from("team_group_memberships").upsert(
      {
        team_id: input.teamId,
        group_id: input.groupId,
        team_membership_id: input.teamMembershipId,
      },
      { onConflict: "group_id,team_membership_id" }
    );
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from("team_group_memberships")
    .delete()
    .eq("team_id", input.teamId)
    .eq("group_id", input.groupId)
    .eq("team_membership_id", input.teamMembershipId);
  if (error) throw error;
}

export async function setCoachTrainingScope(input: {
  teamId: string;
  coachMembershipId: string;
  workoutType: TrainingWorkoutType;
  enabled: boolean;
}) {
  const user = await requireUser();
  const { error } = await db.from("coach_training_permissions").upsert(
    {
      team_id: input.teamId,
      coach_membership_id: input.coachMembershipId,
      workout_type: input.workoutType,
      can_prescribe: input.enabled,
      can_review: input.enabled,
      granted_by: user.id,
    },
    { onConflict: "team_id,coach_membership_id,workout_type" }
  );
  if (error) throw error;
}

export async function updateTeamMemberRoleTitle(input: {
  membershipId: string;
  roleTitle: string | null;
}) {
  await requireUser();
  const roleTitle = input.roleTitle?.trim() || null;
  const { error } = await db
    .from("team_memberships")
    .update({ role_title: roleTitle })
    .eq("id", input.membershipId);
  if (error) throw error;
}

export async function getMyCoachTrainingPermissions(
  teamId: string
): Promise<CoachTrainingPermission[]> {
  const user = await requireUser();
  const { data: membership, error: membershipError } = await db
    .from("team_memberships")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("member_type", "coach")
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership?.id) return [];

  const { data, error } = await db
    .from("coach_training_permissions")
    .select("team_id, coach_membership_id, workout_type, can_prescribe, can_review")
    .eq("team_id", teamId)
    .eq("coach_membership_id", membership.id);
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    team_id: row.team_id,
    coach_membership_id: row.coach_membership_id,
    workout_type: normalizeTrainingDomain(row.workout_type),
    can_prescribe: !!row.can_prescribe,
    can_review: !!row.can_review,
  })) as CoachTrainingPermission[];
}

export async function assignCoachToAthlete(input: {
  teamId: string;
  coachMembershipId: string;
  athleteMembershipId: string;
  isPrimary?: boolean;
}) {
  await requireUser();
  const { data, error } = await db.rpc("assign_coach_to_athlete", {
    p_team_id: input.teamId,
    p_coach_membership_id: input.coachMembershipId,
    p_athlete_membership_id: input.athleteMembershipId,
    p_is_primary: input.isPrimary ?? false,
  });
  if (error) throw error;
  return data as string;
}

export async function endCoachAthleteAssignment(assignmentId: string) {
  await requireUser();
  const { data, error } = await db.rpc("end_coach_athlete_assignment", {
    p_assignment_id: assignmentId,
  });
  if (error) throw error;
  return data as string;
}
