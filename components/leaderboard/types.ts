export type PreviewLeaderboardMetricKey =
  | "total_workouts"
  | "distance_week"
  | "track_workouts"
  | "lift_workouts"
  | "total_sets";

export type FullSummaryLeaderboardMetricKey =
  | "total_workouts"
  | "distance"
  | "track_workouts"
  | "lift_workouts"
  | "total_sets";

export type LeaderboardRangeKey = "30d" | "3m" | "6m" | "1y" | "all";

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  value: number;
};

export type ExerciseScoreType = "max_weight" | "min_time" | "max_reps";

export type ExerciseLeaderboardMeta = {
  exercise_id: string;
  name: string;
  score_type: ExerciseScoreType;
};

export const PREVIEW_LEADERBOARD_METRICS: {
  key: PreviewLeaderboardMetricKey;
  label: string;
}[] = [
  { key: "total_workouts", label: "Total Workouts" },
  { key: "distance_week", label: "Distance This Week" },
  { key: "track_workouts", label: "Track Workouts" },
  { key: "lift_workouts", label: "Lift Workouts" },
  { key: "total_sets", label: "Total Sets" },
];

export const FULL_SUMMARY_LEADERBOARD_METRICS: {
  key: FullSummaryLeaderboardMetricKey;
  label: string;
}[] = [
  { key: "total_workouts", label: "Total Workouts" },
  { key: "distance", label: "Distance" },
  { key: "track_workouts", label: "Track Workouts" },
  { key: "lift_workouts", label: "Lift Workouts" },
  { key: "total_sets", label: "Total Sets" },
];

export const LEADERBOARD_RANGES: {
  key: LeaderboardRangeKey;
  label: string;
}[] = [
  { key: "30d", label: "30 Days" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
  { key: "1y", label: "1 Year" },
  { key: "all", label: "All Time" },
];

export function formatPreviewLeaderboardValue(
  metric: PreviewLeaderboardMetricKey,
  value: number
) {
  if (metric === "distance_week") return `${value.toFixed(0)}m`;
  return `${value}`;
}

export function formatSummaryLeaderboardValue(
  metric: FullSummaryLeaderboardMetricKey,
  value: number
) {
  if (metric === "distance") return `${value.toFixed(0)}m`;
  return `${value}`;
}

export function formatExerciseLeaderboardValue(
  scoreType: ExerciseScoreType,
  value: number
) {
  if (scoreType === "max_weight") return `${value} lb`;
  if (scoreType === "min_time") return `${value.toFixed(2)}s`;
  return `${value} reps`;
}