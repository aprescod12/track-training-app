from pathlib import Path
import re

path = Path("app/(tabs)/index.tsx")
text = path.read_text()

theme_import = 'import { useAppColors } from "../../lib/theme";\n'
if theme_import not in text:
    raise SystemExit("theme import missing")
text = text.replace(
    theme_import,
    theme_import
    + 'import { TRAINING_DOMAINS, normalizeTrainingDomain, trainingDomainLabel, type TrainingDomain } from "../../lib/trainingDomains";\n',
    1,
)

if '  workout_type: "track" | "lift";' not in text:
    raise SystemExit("workout type marker missing")
text = text.replace('  workout_type: "track" | "lift";', '  workout_type: string;', 1)

component_marker = "export default function HomeScreen() {"
if component_marker not in text:
    raise SystemExit("home component marker missing")
helpers = '''function workoutHref(workout: Workout) {
  const domain = normalizeTrainingDomain(workout.workout_type);
  return domain === "jumps" || domain === "throws"
    ? `/field-workout/${workout.id}`
    : `/workout/${workout.id}`;
}

function trainingColor(c: ReturnType<typeof useAppColors>, domain: TrainingDomain) {
  if (domain === "jumps") return c.jumps;
  if (domain === "throws") return c.throws;
  if (domain === "lift") return c.lift;
  return c.running;
}

'''
text = text.replace(component_marker, helpers + component_marker, 1)

state_old = "    trackWorkouts: 0,\n    liftWorkouts: 0,"
state_new = "    runningWorkouts: 0,\n    jumpWorkouts: 0,\n    throwWorkouts: 0,\n    liftWorkouts: 0,"
if state_old not in text:
    raise SystemExit("weekly stats fields missing")
text = text.replace(state_old, state_new, 1)

pattern = re.compile(
    r"  const weekCounts = useMemo\(\(\) => \{.*?  \}, \[weekWorkouts\]\);",
    re.S,
)
replacement = '''  const weekCounts = useMemo(() => {
    const map: Record<
      string,
      { running: number; jumps: number; throws: number; lift: number; total: number }
    > = {};
    for (const w of weekWorkouts) {
      const key = w.workout_date;
      if (!map[key]) map[key] = { running: 0, jumps: 0, throws: 0, lift: 0, total: 0 };
      const domain = normalizeTrainingDomain(w.workout_type);
      map[key][domain] += 1;
      map[key].total += 1;
    }
    return map;
  }, [weekWorkouts]);'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"weekCounts replacement count={count}")

text = text.replace('  const dotTrack = c.dark ? "#34D399" : "green";\n', "", 1)
text = text.replace('  const dotLift = c.dark ? "#60A5FA" : "blue";\n', "", 1)

reset_old = "      setWeeklyStats({ totalDistanceM: 0, trackWorkouts: 0, liftWorkouts: 0, liftSets: 0 });"
reset_new = "      setWeeklyStats({ totalDistanceM: 0, runningWorkouts: 0, jumpWorkouts: 0, throwWorkouts: 0, liftWorkouts: 0, liftSets: 0 });"
if reset_old not in text:
    raise SystemExit("weekly stats reset missing")
text = text.replace(reset_old, reset_new, 1)

count_old = '    const trackWorkouts = weekRows.filter((w: any) => w.workout_type === "track").length;\n    const liftWorkouts = weekRows.filter((w: any) => w.workout_type === "lift").length;'
count_new = '    const runningWorkouts = weekRows.filter((w: any) => normalizeTrainingDomain(w.workout_type) === "running").length;\n    const jumpWorkouts = weekRows.filter((w: any) => normalizeTrainingDomain(w.workout_type) === "jumps").length;\n    const throwWorkouts = weekRows.filter((w: any) => normalizeTrainingDomain(w.workout_type) === "throws").length;\n    const liftWorkouts = weekRows.filter((w: any) => normalizeTrainingDomain(w.workout_type) === "lift").length;'
if count_old not in text:
    raise SystemExit("weekly count code missing")
text = text.replace(count_old, count_new, 1)

distance_old = '      if (r.workouts?.workout_type !== "track") return sum;'
if distance_old not in text:
    raise SystemExit("running distance condition missing")
text = text.replace(
    distance_old,
    '      if (normalizeTrainingDomain(r.workouts?.workout_type) !== "running") return sum;',
    1,
)

set_old = "    setWeeklyStats({ totalDistanceM, trackWorkouts, liftWorkouts, liftSets });"
set_new = "    setWeeklyStats({ totalDistanceM, runningWorkouts, jumpWorkouts, throwWorkouts, liftWorkouts, liftSets });"
if set_old not in text:
    raise SystemExit("weekly setStats missing")
text = text.replace(set_old, set_new, 1)

log_old = '          <PrimaryButton title="Log" onPress={() => router.push(`/modal?date=${todayKey}`)} />'
if log_old not in text:
    raise SystemExit("today log route missing")
text = text.replace(
    log_old,
    '          <PrimaryButton title="Log" onPress={() => router.push(`/workout/new?date=${todayKey}`)} />',
    1,
)

label_old = '{todaysWorkout.workout_type === "track" ? "Track" : "Lift"} • {todaysWorkout.workout_date}'
if label_old not in text:
    raise SystemExit("today domain label missing")
text = text.replace(
    label_old,
    '{trainingDomainLabel(todaysWorkout.workout_type)} • {todaysWorkout.workout_date}',
    1,
)

route_old = '            <Pressable onPress={() => router.push(`/workout/${todaysWorkout.id}`)}>'
if route_old not in text:
    raise SystemExit("today detail route missing")
text = text.replace(
    route_old,
    '            <Pressable onPress={() => router.push(workoutHref(todaysWorkout) as any)}>',
    1,
)

total_old = "{weeklyStats.trackWorkouts + weeklyStats.liftWorkouts}"
if total_old not in text:
    raise SystemExit("weekly total expression missing")
text = text.replace(
    total_old,
    "{weeklyStats.runningWorkouts + weeklyStats.jumpWorkouts + weeklyStats.throwWorkouts + weeklyStats.liftWorkouts}",
    1,
)

lift_card_old = '<Text style={{ color: c.subtext }}>Lifts</Text>\n            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>{weeklyStats.liftWorkouts}</Text>'
lift_card_new = '<Text style={{ color: c.subtext }}>Field / Lift</Text>\n            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>\n              {weeklyStats.jumpWorkouts + weeklyStats.throwWorkouts} / {weeklyStats.liftWorkouts}\n            </Text>\n            <Text style={{ color: c.subtext, fontSize: 11 }}>sessions</Text>'
if lift_card_old not in text:
    raise SystemExit("weekly lift card missing")
text = text.replace(lift_card_old, lift_card_new, 1)

mini_vars = "            const trackCount = counts?.track ?? 0;\n            const liftCount = counts?.lift ?? 0;\n            const total = counts?.total ?? 0;"
if mini_vars not in text:
    raise SystemExit("mini calendar vars missing")
text = text.replace(mini_vars, "            const total = counts?.total ?? 0;", 1)

start = text.index("{total > 0 && (", text.index("const total = counts?.total ?? 0;"))
end = text.index("              </Pressable>", start)
marker_block = '''{total > 0 && (
                  <View style={{ marginTop: 4, flexDirection: "row", gap: 3, alignItems: "center" }}>
                    {TRAINING_DOMAINS.map((domain) =>
                      (counts?.[domain.value] ?? 0) > 0 ? (
                        <View
                          key={domain.value}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            backgroundColor: trainingColor(c, domain.value),
                          }}
                        />
                      ) : null
                    )}
                  </View>
                )}
'''
text = text[:start] + marker_block + text[end:]

path.write_text(text)
