import { supabase } from "./supabase";

const workflowClient = supabase as any;

export type AssignmentOutcome =
  | "completed"
  | "partially_completed"
  | "modified"
  | "skipped"
  | "unavailable";

export type UnavailableReason = "injury" | "illness" | "other";

export type AthleteAssignment = {
  assignment_recipient_id: string;
  assignment_id: string;
  team_id: string;
  team_name: string | null;
  athlete_membership_id: string;
  scheduled_date: string;
  due_at: string | null;
  title_snapshot: string;
  workout_type_snapshot: "track" | "lift";
  instructions: string | null;
  assignment_status: "scheduled" | "closed" | "cancelled";
  assigned_at: string;
  assignment_updated_at: string;
  submission_id: string | null;
  completion_status: AssignmentOutcome | null;
  unavailable_reason: UnavailableReason | null;
  athlete_note: string | null;
  workout_id: string | null;
  submitted_at: string | null;
  submission_updated_at: string | null;
  reviewed_at: string | null;
  coach_note: string | null;
};

export type CoachAssignment = AthleteAssignment & {
  athlete_user_id: string;
  athlete_full_name: string | null;
  athlete_username: string | null;
  reviewed_by_membership_id: string | null;
};

export type AssignmentEntry = {
  id: string;
  assignment_id: string;
  sort_order: number;
  exercise_id: string | null;
  exercise_name_snapshot: string;
  label: string | null;
  sets: number | null;
  reps: number | null;
  distance_m: number | null;
  target_time_text: string | null;
  target_weight: number | null;
  recovery_seconds: number | null;
  intensity_text: string | null;
  notes: string | null;
};

export type CoachTeam = {
  team_id: string;
  membership_id: string;
  team_name: string;
};

export type CoachAthlete = {
  membership_id: string;
  user_id: string;
  display_name: string;
};

export type TeamGroup = {
  id: string;
  name: string;
  group_type: string | null;
};

export type WorkoutTemplate = {
  id: string;
  team_id: string;
  title: string;
  workout_type: "track" | "lift";
  description: string | null;
};

export type WorkoutTemplateEntryDraft = {
  exercise_name_snapshot: string;
  label?: string | null;
  sets?: number | null;
  reps?: number | null;
  distance_m?: number | null;
  target_time_text?: string | null;
  target_weight?: number | null;
  recovery_seconds?: number | null;
  intensity_text?: string | null;
  notes?: string | null;
};

function requireRows<T>(rows: T[] | null | undefined) {
  return (rows ?? []) as T[];
}

function normalizeAthleteAssignment(row: any): AthleteAssignment {
  return {
    assignment_recipient_id: String(row.assignment_recipient_id),
    assignment_id: String(row.assignment_id),
    team_id: String(row.team_id),
    team_name: row.team_name ?? null,
    athlete_membership_id: String(row.athlete_membership_id),
    scheduled_date: String(row.scheduled_date),
    due_at: row.due_at ?? null,
    title_snapshot: String(row.title_snapshot),
    workout_type_snapshot: row.workout_type_snapshot === "lift" ? "lift" : "track",
    instructions: row.instructions ?? null,
    assignment_status: row.assignment_status,
    assigned_at: String(row.assigned_at),
    assignment_updated_at: String(row.assignment_updated_at),
    submission_id: row.submission_id ?? null,
    completion_status: row.completion_status ?? null,
    unavailable_reason: row.unavailable_reason ?? null,
    athlete_note: row.athlete_note ?? null,
    workout_id: row.workout_id ?? null,
    submitted_at: row.submitted_at ?? null,
    submission_updated_at: row.submission_updated_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    coach_note: row.coach_note ?? null,
  };
}

export async function getAthleteAssignments(params?: {
  startDate?: string;
  endDate?: string;
}) {
  let query = workflowClient
    .from("athlete_assignment_inbox_v")
    .select("*")
    .order("scheduled_date", { ascending: true })
    .order("assigned_at", { ascending: true });

  if (params?.startDate) query = query.gte("scheduled_date", params.startDate);
  if (params?.endDate) query = query.lte("scheduled_date", params.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return requireRows<any>(data).map(normalizeAthleteAssignment);
}

export async function getAthleteAssignment(recipientId: string) {
  const { data, error } = await workflowClient
    .from("athlete_assignment_inbox_v")
    .select("*")
    .eq("assignment_recipient_id", recipientId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeAthleteAssignment(data) : null;
}

export async function getCoachAssignments(params?: {
  startDate?: string;
  endDate?: string;
}) {
  let query = workflowClient
    .from("coach_assignment_dashboard_v")
    .select("*")
    .order("scheduled_date", { ascending: true })
    .order("athlete_full_name", { ascending: true });

  if (params?.startDate) query = query.gte("scheduled_date", params.startDate);
  if (params?.endDate) query = query.lte("scheduled_date", params.endDate);

  const { data, error } = await query;
  if (error) throw error;

  return requireRows<any>(data).map((row) => ({
    ...normalizeAthleteAssignment(row),
    athlete_user_id: String(row.athlete_user_id),
    athlete_full_name: row.athlete_full_name ?? null,
    athlete_username: row.athlete_username ?? null,
    reviewed_by_membership_id: row.reviewed_by_membership_id ?? null,
  })) as CoachAssignment[];
}

export async function getCoachAssignment(recipientId: string) {
  const { data, error } = await workflowClient
    .from("coach_assignment_dashboard_v")
    .select("*")
    .eq("assignment_recipient_id", recipientId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...normalizeAthleteAssignment(data),
    athlete_user_id: String(data.athlete_user_id),
    athlete_full_name: data.athlete_full_name ?? null,
    athlete_username: data.athlete_username ?? null,
    reviewed_by_membership_id: data.reviewed_by_membership_id ?? null,
  } as CoachAssignment;
}

export async function getAssignmentEntries(assignmentId: string) {
  const { data, error } = await workflowClient
    .from("workout_assignment_entries")
    .select(
      "id, assignment_id, sort_order, exercise_id, exercise_name_snapshot, label, sets, reps, distance_m, target_time_text, target_weight, recovery_seconds, intensity_text, notes"
    )
    .eq("assignment_id", assignmentId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return requireRows<AssignmentEntry>(data);
}

export async function submitWorkoutAssignment(params: {
  recipientId: string;
  completionStatus: AssignmentOutcome;
  workoutId?: string | null;
  unavailableReason?: UnavailableReason | null;
  athleteNote?: string | null;
}) {
  const { data, error } = await workflowClient.rpc("submit_workout_assignment", {
    p_assignment_recipient_id: params.recipientId,
    p_completion_status: params.completionStatus,
    p_workout_id: params.workoutId ?? null,
    p_unavailable_reason: params.unavailableReason ?? null,
    p_athlete_note: params.athleteNote?.trim() || null,
  });

  if (error) throw error;
  return data as string;
}

export async function reviewWorkoutAssignmentSubmission(params: {
  submissionId: string;
  coachNote?: string | null;
}) {
  const { data, error } = await workflowClient.rpc(
    "review_workout_assignment_submission",
    {
      p_submission_id: params.submissionId,
      p_coach_note: params.coachNote?.trim() || null,
    }
  );

  if (error) throw error;
  return data as string;
}

export async function getActiveCoachTeams(): Promise<CoachTeam[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData.user?.id;
  if (!uid) return [];

  const { data, error } = await workflowClient
    .from("team_memberships")
    .select("id, team_id, teams(name)")
    .eq("user_id", uid)
    .eq("member_type", "coach")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return requireRows<any>(data).map((row) => ({
    team_id: String(row.team_id),
    membership_id: String(row.id),
    team_name: row.teams?.name ?? "Team",
  }));
}

export async function getCoachAthletes(teamId: string): Promise<CoachAthlete[]> {
  const teams = await getActiveCoachTeams();
  const coachMembership = teams.find((team) => team.team_id === teamId);
  if (!coachMembership) return [];

  const { data: assignmentData, error: assignmentError } = await workflowClient
    .from("coach_athlete_assignments")
    .select("athlete_membership_id")
    .eq("team_id", teamId)
    .eq("coach_membership_id", coachMembership.membership_id)
    .eq("active", true);

  if (assignmentError) throw assignmentError;

  const athleteIds = Array.from(
    new Set(requireRows<any>(assignmentData).map((row) => String(row.athlete_membership_id)))
  );
  if (!athleteIds.length) return [];

  const { data: memberData, error: memberError } = await workflowClient
    .from("team_memberships")
    .select("id, user_id")
    .eq("team_id", teamId)
    .eq("member_type", "athlete")
    .eq("status", "active")
    .in("id", athleteIds);

  if (memberError) throw memberError;
  const members = requireRows<any>(memberData);
  const userIds = members.map((row) => String(row.user_id));

  const { data: profileData, error: profileError } = await workflowClient
    .from("profiles")
    .select("id, full_name, username")
    .in("id", userIds);

  if (profileError) throw profileError;
  const profileById = new Map(
    requireRows<any>(profileData).map((row) => [String(row.id), row])
  );

  return members
    .map((member) => {
      const profile = profileById.get(String(member.user_id));
      const label =
        profile?.full_name?.trim?.() ||
        profile?.username?.trim?.() ||
        "Athlete";
      return {
        membership_id: String(member.id),
        user_id: String(member.user_id),
        display_name: label,
      };
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function getTeamGroups(teamId: string): Promise<TeamGroup[]> {
  const { data, error } = await workflowClient
    .from("team_groups")
    .select("id, name, group_type")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return requireRows<TeamGroup>(data);
}

export async function getWorkoutTemplates(teamId: string): Promise<WorkoutTemplate[]> {
  const { data, error } = await workflowClient
    .from("workout_templates")
    .select("id, team_id, title, workout_type, description")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return requireRows<any>(data).map((row) => ({
    ...row,
    workout_type: row.workout_type === "lift" ? "lift" : "track",
  })) as WorkoutTemplate[];
}

export async function createWorkoutTemplate(params: {
  team: CoachTeam;
  title: string;
  workoutType: "track" | "lift";
  description?: string | null;
  entries: WorkoutTemplateEntryDraft[];
}) {
  const title = params.title.trim();
  const entries = params.entries.filter((entry) => entry.exercise_name_snapshot.trim());
  if (!title) throw new Error("Template title is required.");
  if (!entries.length) throw new Error("Add at least one prescription entry.");

  const { data: template, error: templateError } = await workflowClient
    .from("workout_templates")
    .insert({
      team_id: params.team.team_id,
      created_by_membership_id: params.team.membership_id,
      title,
      workout_type: params.workoutType,
      description: params.description?.trim() || null,
    })
    .select("id")
    .single();

  if (templateError) throw templateError;
  if (!template?.id) throw new Error("Template creation returned no identifier.");

  const payload = entries.map((entry, index) => ({
    template_id: template.id,
    sort_order: index,
    exercise_name_snapshot: entry.exercise_name_snapshot.trim(),
    label: entry.label?.trim() || null,
    sets: entry.sets ?? null,
    reps: entry.reps ?? null,
    distance_m: entry.distance_m ?? null,
    target_time_text: entry.target_time_text?.trim() || null,
    target_weight: entry.target_weight ?? null,
    recovery_seconds: entry.recovery_seconds ?? null,
    intensity_text: entry.intensity_text?.trim() || null,
    notes: entry.notes?.trim() || null,
  }));

  const { error: entryError } = await workflowClient
    .from("workout_template_entries")
    .insert(payload);

  if (entryError) {
    await workflowClient
      .from("workout_templates")
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq("id", template.id);
    throw entryError;
  }

  return String(template.id);
}

export async function createWorkoutAssignment(params: {
  teamId: string;
  templateId: string;
  scheduledDate: string;
  dueAt?: string | null;
  instructions?: string | null;
  targetTeam?: boolean;
  groupIds?: string[];
  athleteMembershipIds?: string[];
}) {
  const { data, error } = await workflowClient.rpc("create_workout_assignment", {
    p_team_id: params.teamId,
    p_template_id: params.templateId,
    p_scheduled_date: params.scheduledDate,
    p_due_at: params.dueAt ?? null,
    p_instructions: params.instructions?.trim() || null,
    p_target_team: params.targetTeam ?? false,
    p_group_ids: params.groupIds ?? [],
    p_athlete_membership_ids: params.athleteMembershipIds ?? [],
  });

  if (error) throw error;
  return data as string;
}
