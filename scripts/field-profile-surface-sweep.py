from pathlib import Path
import re

# -----------------------------------------------------------------------------
# Running Stats keeps the historical route path but uses Running semantics.
# -----------------------------------------------------------------------------
path = Path("app/profile/track-stats.tsx")
text = path.read_text()
text = text.replace('.eq("workout_type", "track")', '.in("workout_type", ["running", "track"])')
text = text.replace('.eq("workouts.workout_type", "track")', '.in("workouts.workout_type", ["running", "track"])')
text = text.replace("Track Stats", "Running Stats")
text = text.replace("Track sessions", "Running sessions")
text = text.replace("track stats", "running stats")
text = text.replace("track PR count", "running PR count")
path.write_text(text)

# -----------------------------------------------------------------------------
# Main Profile understands Running / Jumps / Throws / Lift.
# -----------------------------------------------------------------------------
path = Path("app/(tabs)/profile.tsx")
text = path.read_text()
error_import = 'import { toAppError } from "../../lib/errors";\n'
if error_import not in text:
    raise SystemExit("profile import marker missing")
text = text.replace(
    error_import,
    error_import + 'import { normalizeTrainingDomain } from "../../lib/trainingDomains";\n',
    1,
)

text = re.sub(
    r"(?m)^(\s*)trackWorkouts: 0,$",
    lambda m: (
        f"{m.group(1)}runningWorkouts: 0,\n"
        f"{m.group(1)}jumpWorkouts: 0,\n"
        f"{m.group(1)}throwWorkouts: 0,"
    ),
    text,
)

count_old = '''      const totalWorkouts = workoutRows?.length ?? 0;
      const trackWorkouts = (workoutRows ?? []).filter((w) => w.workout_type === "track").length;
      const liftWorkouts = (workoutRows ?? []).filter((w) => w.workout_type === "lift").length;'''
count_new = '''      const totalWorkouts = workoutRows?.length ?? 0;
      const runningWorkouts = (workoutRows ?? []).filter(
        (w) => normalizeTrainingDomain(w.workout_type) === "running"
      ).length;
      const jumpWorkouts = (workoutRows ?? []).filter(
        (w) => normalizeTrainingDomain(w.workout_type) === "jumps"
      ).length;
      const throwWorkouts = (workoutRows ?? []).filter(
        (w) => normalizeTrainingDomain(w.workout_type) === "throws"
      ).length;
      const liftWorkouts = (workoutRows ?? []).filter(
        (w) => normalizeTrainingDomain(w.workout_type) === "lift"
      ).length;'''
if count_old not in text:
    raise SystemExit("profile workout count marker missing")
text = text.replace(count_old, count_new, 1)

if '        if (r.workouts?.workout_type !== "track") return sum;' not in text:
    raise SystemExit("profile running distance marker missing")
text = text.replace(
    '        if (r.workouts?.workout_type !== "track") return sum;',
    '        if (normalizeTrainingDomain(r.workouts?.workout_type) !== "running") return sum;',
    1,
)

set_old = '''      setStats({
        totalWorkouts,
        trackWorkouts,
        liftWorkouts,
        totalDistanceM,
        totalLiftSets,
      });'''
set_new = '''      setStats({
        totalWorkouts,
        runningWorkouts,
        jumpWorkouts,
        throwWorkouts,
        liftWorkouts,
        totalDistanceM,
        totalLiftSets,
      });'''
if set_old not in text:
    raise SystemExit("profile setStats marker missing")
text = text.replace(set_old, set_new, 1)
text = text.replace('sublabel="Track distance total"', 'sublabel="Running distance total"', 1)

performance_old = '''          {loadingStats ? (
            <ActivityIndicator />
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatTile
                label="Track Focus"
                value={stats.trackWorkouts}
                sublabel={
                  stats.totalWorkouts > 0
                    ? `${Math.round((stats.trackWorkouts / stats.totalWorkouts) * 100)}% of workouts`
                    : "No workouts yet"
                }
                onPress={() => router.push("/profile/track-stats")}
              />
              <StatTile
                label="Lift Focus"
                value={stats.liftWorkouts}
                sublabel={
                  stats.totalWorkouts > 0
                    ? `${Math.round((stats.liftWorkouts / stats.totalWorkouts) * 100)}% of workouts`
                    : "No workouts yet"
                }
                onPress={() => router.push("/profile/lift-stats")}
              />
            </View>
          )}'''
performance_new = '''          {loadingStats ? (
            <ActivityIndicator />
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatTile
                  label="Running"
                  value={stats.runningWorkouts}
                  sublabel={stats.totalWorkouts > 0 ? `${Math.round((stats.runningWorkouts / stats.totalWorkouts) * 100)}% of workouts` : "No workouts yet"}
                  onPress={() => router.push("/profile/track-stats")}
                />
                <StatTile
                  label="Jumps"
                  value={stats.jumpWorkouts}
                  sublabel={stats.totalWorkouts > 0 ? `${Math.round((stats.jumpWorkouts / stats.totalWorkouts) * 100)}% of workouts` : "No workouts yet"}
                  onPress={() => router.push("/profile/field-stats?domain=jumps")}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatTile
                  label="Throws"
                  value={stats.throwWorkouts}
                  sublabel={stats.totalWorkouts > 0 ? `${Math.round((stats.throwWorkouts / stats.totalWorkouts) * 100)}% of workouts` : "No workouts yet"}
                  onPress={() => router.push("/profile/field-stats?domain=throws")}
                />
                <StatTile
                  label="Lift"
                  value={stats.liftWorkouts}
                  sublabel={stats.totalWorkouts > 0 ? `${Math.round((stats.liftWorkouts / stats.totalWorkouts) * 100)}% of workouts` : "No workouts yet"}
                  onPress={() => router.push("/profile/lift-stats")}
                />
              </View>
            </View>
          )}'''
if performance_old not in text:
    raise SystemExit("profile performance block missing")
text = text.replace(performance_old, performance_new, 1)
path.write_text(text)

# -----------------------------------------------------------------------------
# Overview: four-domain training split and domain-aware recent activity.
# -----------------------------------------------------------------------------
path = Path("app/profile/overview.tsx")
text = path.read_text()
date_import = 'import { formatYMD } from "../../lib/date";\n'
if date_import not in text:
    raise SystemExit("overview import marker missing")
text = text.replace(
    date_import,
    date_import + 'import { normalizeTrainingDomain, trainingDomainLabel } from "../../lib/trainingDomains";\n',
    1,
)
text = text.replace('workout_type: "track" | "lift" | string;', 'workout_type: string;', 1)
text = text.replace("allTimeTrack", "allTimeRunning")
text = text.replace("weekTrack", "weekRunning")
text = text.replace("monthTrack", "monthRunning")
text = text.replace("trackPct", "runningPct")

text = re.sub(
    r"(?m)^(\s*)allTimeRunning: 0,$",
    lambda m: f"{m.group(1)}allTimeRunning: 0,\n{m.group(1)}allTimeJumps: 0,\n{m.group(1)}allTimeThrows: 0,",
    text,
)
text = re.sub(
    r"(?m)^(\s*)weekRunning: 0,$",
    lambda m: f"{m.group(1)}weekRunning: 0,\n{m.group(1)}weekJumps: 0,\n{m.group(1)}weekThrows: 0,",
    text,
)
text = re.sub(
    r"(?m)^(\s*)monthRunning: 0,$",
    lambda m: f"{m.group(1)}monthRunning: 0,\n{m.group(1)}monthJumps: 0,\n{m.group(1)}monthThrows: 0,",
    text,
)

count_old = '''      const allTimeRunning = workouts.filter((w) => w.workout_type === "track").length;
      const allTimeLift = workouts.filter((w) => w.workout_type === "lift").length;'''
count_new = '''      const allTimeRunning = workouts.filter((w) => normalizeTrainingDomain(w.workout_type) === "running").length;
      const allTimeJumps = workouts.filter((w) => normalizeTrainingDomain(w.workout_type) === "jumps").length;
      const allTimeThrows = workouts.filter((w) => normalizeTrainingDomain(w.workout_type) === "throws").length;
      const allTimeLift = workouts.filter((w) => normalizeTrainingDomain(w.workout_type) === "lift").length;'''
if count_old not in text:
    raise SystemExit("overview all-time count marker missing")
text = text.replace(count_old, count_new, 1)

period_old = '''      const weekRunning = weekRows.filter((w) => w.workout_type === "track").length;
      const weekLift = weekRows.filter((w) => w.workout_type === "lift").length;
      const monthRunning = monthRows.filter((w) => w.workout_type === "track").length;
      const monthLift = monthRows.filter((w) => w.workout_type === "lift").length;'''
period_new = '''      const weekRunning = weekRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "running").length;
      const weekJumps = weekRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "jumps").length;
      const weekThrows = weekRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "throws").length;
      const weekLift = weekRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "lift").length;
      const monthRunning = monthRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "running").length;
      const monthJumps = monthRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "jumps").length;
      const monthThrows = monthRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "throws").length;
      const monthLift = monthRows.filter((w) => normalizeTrainingDomain(w.workout_type) === "lift").length;'''
if period_old not in text:
    raise SystemExit("overview period count marker missing")
text = text.replace(period_old, period_new, 1)

if '        if (workout?.workout_type !== "track") continue;' not in text:
    raise SystemExit("overview distance marker missing")
text = text.replace(
    '        if (workout?.workout_type !== "track") continue;',
    '        if (normalizeTrainingDomain(workout?.workout_type) !== "running") continue;',
    1,
)

text = text.replace("        allTimeRunning,\n        allTimeLift,", "        allTimeRunning,\n        allTimeJumps,\n        allTimeThrows,\n        allTimeLift,", 1)
text = text.replace("        weekRunning,\n        weekLift,", "        weekRunning,\n        weekJumps,\n        weekThrows,\n        weekLift,", 1)
text = text.replace("        monthRunning,\n        monthLift,", "        monthRunning,\n        monthJumps,\n        monthThrows,\n        monthLift,", 1)

pct_marker = '''  const liftPct = useMemo(() => {
    if (!stats.allTimeWorkouts) return 0;
    return Math.round((stats.allTimeLift / stats.allTimeWorkouts) * 100);
  }, [stats.allTimeLift, stats.allTimeWorkouts]);'''
pct_new = '''  const jumpsPct = useMemo(() => {
    if (!stats.allTimeWorkouts) return 0;
    return Math.round((stats.allTimeJumps / stats.allTimeWorkouts) * 100);
  }, [stats.allTimeJumps, stats.allTimeWorkouts]);

  const throwsPct = useMemo(() => {
    if (!stats.allTimeWorkouts) return 0;
    return Math.round((stats.allTimeThrows / stats.allTimeWorkouts) * 100);
  }, [stats.allTimeThrows, stats.allTimeWorkouts]);

  const liftPct = useMemo(() => {
    if (!stats.allTimeWorkouts) return 0;
    return Math.round((stats.allTimeLift / stats.allTimeWorkouts) * 100);
  }, [stats.allTimeLift, stats.allTimeWorkouts]);'''
if pct_marker not in text:
    raise SystemExit("overview percentage marker missing")
text = text.replace(pct_marker, pct_new, 1)

text = text.replace(
    "    if (!stats.weekWorkouts) return 0;\n    return stats.weekDistanceM / stats.weekWorkouts / 1000;\n  }, [stats.weekDistanceM, stats.weekWorkouts]);",
    "    if (!stats.weekRunning) return 0;\n    return stats.weekDistanceM / stats.weekRunning / 1000;\n  }, [stats.weekDistanceM, stats.weekRunning]);",
    1,
)
text = text.replace(
    "    if (!stats.monthWorkouts) return 0;\n    return stats.monthDistanceM / stats.monthWorkouts / 1000;\n  }, [stats.monthDistanceM, stats.monthWorkouts]);",
    "    if (!stats.monthRunning) return 0;\n    return stats.monthDistanceM / stats.monthRunning / 1000;\n  }, [stats.monthDistanceM, stats.monthRunning]);",
    1,
)

stat_marker = "  function StatCard({"
if stat_marker not in text:
    raise SystemExit("overview StatCard marker missing")
helper = '''  function workoutHref(workout: WorkoutRow) {
    const domain = normalizeTrainingDomain(workout.workout_type);
    return domain === "jumps" || domain === "throws"
      ? `/field-workout/${workout.id}`
      : `/workout/${workout.id}`;
  }

'''
text = text.replace(stat_marker, helper + stat_marker, 1)

split_old = '''                  <View
                    style={{
                      width: `${runningPct}%`,
                      height: "100%",
                      backgroundColor: c.primary,
                    }}
                  />
                  <View
                    style={{
                      width: `${liftPct}%`,
                      height: "100%",
                      backgroundColor: c.border,
                    }}
                  />'''
split_new = '''                  <View style={{ width: `${runningPct}%`, height: "100%", backgroundColor: c.running }} />
                  <View style={{ width: `${jumpsPct}%`, height: "100%", backgroundColor: c.jumps }} />
                  <View style={{ width: `${throwsPct}%`, height: "100%", backgroundColor: c.throws }} />
                  <View style={{ width: `${liftPct}%`, height: "100%", backgroundColor: c.lift }} />'''
if split_old not in text:
    raise SystemExit("overview split bar marker missing")
text = text.replace(split_old, split_new, 1)

legend_old = '''                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.subtext }}>Track {runningPct}%</Text>
                  <Text style={{ color: c.subtext }}>Lift {liftPct}%</Text>
                </View>'''
legend_new = '''                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  <Text style={{ color: c.subtext }}>Running {runningPct}%</Text>
                  <Text style={{ color: c.subtext }}>Jumps {jumpsPct}%</Text>
                  <Text style={{ color: c.subtext }}>Throws {throwsPct}%</Text>
                  <Text style={{ color: c.subtext }}>Lift {liftPct}%</Text>
                </View>'''
if legend_old not in text:
    raise SystemExit("overview split legend marker missing")
text = text.replace(legend_old, legend_new, 1)

quick_old = '''              <View style={{ flexDirection: "row", gap: 10 }}>
                <QuickLink
                  title="Track Stats"
                  subtitle="Distance, workouts, top exercises"
                  onPress={() => router.push("/profile/track-stats")}
                />
                <QuickLink
                  title="Lift Stats"
                  subtitle="Volume, reps, top exercises"
                  onPress={() => router.push("/profile/lift-stats")}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <QuickLink
                  title="Training Hub"
                  subtitle="Jump into your training tools"
                  onPress={() => router.push("/profile/training-hub")}
                />
                <QuickLink
                  title="Profile"
                  subtitle="Back to your main profile"
                  onPress={() => router.push("/(tabs)/profile")}
                />
              </View>'''
quick_new = '''              <View style={{ flexDirection: "row", gap: 10 }}>
                <QuickLink
                  title="Running Stats"
                  subtitle="Distance, workouts, top exercises"
                  onPress={() => router.push("/profile/track-stats")}
                />
                <QuickLink
                  title="Field Stats"
                  subtitle="Jumps, throws, and training bests"
                  onPress={() => router.push("/profile/field-stats")}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <QuickLink
                  title="Lift Stats"
                  subtitle="Volume, reps, top exercises"
                  onPress={() => router.push("/profile/lift-stats")}
                />
                <QuickLink
                  title="Training Hub"
                  subtitle="Jump into your training tools"
                  onPress={() => router.push("/profile/training-hub")}
                />
              </View>'''
if quick_old not in text:
    raise SystemExit("overview quick access marker missing")
text = text.replace(quick_old, quick_new, 1)

text = text.replace('sublabel="Track distance total"', 'sublabel="Running distance total"', 1)
text = text.replace('sublabel={`${stats.weekRunning} track • ${stats.weekLift} lift`}', 'sublabel={`${stats.weekRunning} running • ${stats.weekJumps} jumps • ${stats.weekThrows} throws • ${stats.weekLift} lift`}', 1)
text = text.replace('sublabel="Track distance this week"', 'sublabel="Running distance this week"', 1)
text = text.replace('sublabel={`${stats.monthRunning} track • ${stats.monthLift} lift`}', 'sublabel={`${stats.monthRunning} running • ${stats.monthJumps} jumps • ${stats.monthThrows} throws • ${stats.monthLift} lift`}', 1)
text = text.replace('sublabel="Track distance this month"', 'sublabel="Running distance this month"', 1)
text = text.replace('sublabel="Per workout"', 'sublabel="Per running workout"', 2)

recent_route = '                    onPress={() => router.push(`/workout/${w.id}`)}'
if recent_route not in text:
    raise SystemExit("overview recent route marker missing")
text = text.replace(recent_route, '                    onPress={() => router.push(workoutHref(w) as any)}', 1)
recent_label = '''                    <Text style={{ color: c.subtext }}>
                      {w.workout_type === "track" ? "Track" : "Lift"}
                    </Text>'''
recent_label_new = '''                    <Text style={{ color: c.subtext }}>
                      {trainingDomainLabel(w.workout_type)}
                    </Text>'''
if recent_label not in text:
    raise SystemExit("overview recent label marker missing")
text = text.replace(recent_label, recent_label_new, 1)
path.write_text(text)

# -----------------------------------------------------------------------------
# Training Hub routes all workout logging through the domain chooser and gives
# field performance its own destination.
# -----------------------------------------------------------------------------
path = Path("app/profile/training-hub.tsx")
text = path.read_text()
text = text.replace('          flex: 1,\n          minHeight:', '          flex: 1,\n          minWidth: 220,\n          minHeight:', 1)
text = text.replace('style={{ flexDirection: "row", gap: 10 }}', 'style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}')
text = text.replace('onPress={() => router.push("/modal")}', 'onPress={() => router.push("/workout/new")}', 2)
text = text.replace('title="Track Stats"', 'title="Running Stats"', 1)
text = text.replace('subtitle="Distance, recent workouts, top exercises, and PR activity."', 'subtitle="Running distance, recent workouts, top exercises, and PR activity."', 1)
performance_marker = '''            <HubTile
              title="Lift Stats"
              subtitle="Volume, sets, reps, top lifts, and recent strength work."
              onPress={() => router.push("/profile/lift-stats")}
            />'''
performance_add = '''            <HubTile
              title="Field Stats"
              subtitle="Jump and throw training bests, implements, and recent field sessions."
              onPress={() => router.push("/profile/field-stats")}
            />
            <HubTile
              title="Lift Stats"
              subtitle="Volume, sets, reps, top lifts, and recent strength work."
              onPress={() => router.push("/profile/lift-stats")}
            />'''
if performance_marker not in text:
    raise SystemExit("training hub performance marker missing")
text = text.replace(performance_marker, performance_add, 1)
text = text.replace("Add a track or lift session and keep your history updated.", "Choose Running, Jumps, Throws, or Lift and keep your history updated.", 1)
text = text.replace("Open Track Stats or Lift Stats to look deeper at your numbers.", "Open Running, Field, or Lift Stats to look deeper at your numbers.", 1)
text = text.replace('onPress={() => router.push("/profile/track-stats")}\n              style={{', 'onPress={() => router.push("/profile/field-stats")}\n              style={{', 1)
path.write_text(text)

# -----------------------------------------------------------------------------
# Root stack title + field stats route.
# -----------------------------------------------------------------------------
path = Path("app/_layout.tsx")
text = path.read_text()
text = text.replace('title: "Track Stats",', 'title: "Running Stats",', 1)
marker = '        <Stack.Screen\n          name="profile/overview"'
if marker not in text:
    raise SystemExit("root overview route marker missing")
addition = '''        <Stack.Screen
          name="profile/field-stats"
          options={{
            presentation: "modal",
            title: "Field Stats",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

'''
text = text.replace(marker, addition + marker, 1)
path.write_text(text)
