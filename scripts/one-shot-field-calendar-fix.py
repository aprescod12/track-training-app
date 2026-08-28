from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing marker: {label}")
    return text.replace(old, new, 1)


# New field relations are not in the generated Supabase types yet, so use the
# same deliberate untyped bridge already used by the team/workflow services.
field = Path("app/field-log.tsx")
text = field.read_text()
text = replace_once(
    text,
    'import { useAppColors } from "../lib/theme";\n',
    'import { useAppColors } from "../lib/theme";\n\nconst fieldClient = supabase as any;\n',
    "field client import",
)
text = replace_once(
    text,
    '      let bestQuery = supabase\n        .from("field_event_bests_v")',
    '      let bestQuery = fieldClient\n        .from("field_event_bests_v")',
    "field best view",
)
text = replace_once(
    text,
    '      const { error: attemptsError } = await supabase.from("field_attempts").insert(',
    '      const { error: attemptsError } = await fieldClient.from("field_attempts").insert(',
    "field attempts client",
)
text = replace_once(
    text,
    '    const cleanedAttempts = attempts.map((attempt, index) => {',
    '    let cleanedAttempts;\n    try {\n      cleanedAttempts = attempts.map((attempt, index) => {',
    "attempt validation start",
)
text = replace_once(
    text,
    '    });\n\n    if (!cleanedAttempts.length) {',
    '      });\n    } catch (validationError: any) {\n      setError(validationError?.message ?? String(validationError));\n      return;\n    }\n\n    if (!cleanedAttempts.length) {',
    "attempt validation end",
)
text = text.replace(
    "Start a separate workout entry when changing implement weight so marks stay comparable.",
    "Start a separate log when changing implement weight so marks stay comparable.",
)
field.write_text(text)

# Correct the assertion count in the dedicated field-domain test.
test = Path("supabase/tests/database/field_event_training_domains.test.sql")
text = test.read_text()
text = replace_once(text, "select plan(31);", "select plan(32);", "field pgTAP plan")
test.write_text(text)

# Calendar: count and render all four training domains instead of assuming the
# old Track/Lift pair.
calendar = Path("app/(tabs)/calendar.tsx")
text = calendar.read_text()
text = replace_once(
    text,
    'import { syncAthleteTrainingNotifications } from "../../lib/trainingNotifications";\n',
    'import { syncAthleteTrainingNotifications } from "../../lib/trainingNotifications";\nimport { TRAINING_DOMAINS, trainingDomainLabel, type TrainingDomain } from "../../lib/trainingDomains";\n',
    "calendar domain import",
)
text = replace_once(
    text,
    '  workout_type: "track" | "lift";',
    '  workout_type: TrainingDomain;',
    "calendar workout type",
)
text = replace_once(
    text,
    '''type TrainingMarkerCounts = {
  track: number;
  lift: number;
  total: number;
};''',
    '''type TrainingMarkerCounts = {
  running: number;
  jumps: number;
  throws: number;
  lift: number;
  total: number;
};''',
    "calendar marker type",
)
text = replace_once(
    text,
    '''function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
''',
    '''function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function emptyTrainingCounts(): TrainingMarkerCounts {
  return { running: 0, jumps: 0, throws: 0, lift: 0, total: 0 };
}

function trainingColor(c: ReturnType<typeof useAppColors>, domain: TrainingDomain) {
  if (domain === "jumps") return c.jumps;
  if (domain === "throws") return c.throws;
  if (domain === "lift") return c.lift;
  return c.running;
}

function workoutHref(workout: Workout) {
  return workout.workout_type === "jumps" || workout.workout_type === "throws"
    ? `/field-workout/${workout.id}`
    : `/workout/${workout.id}`;
}
''',
    "calendar helpers",
)
text = replace_once(
    text,
    'map[workout.workout_date] = { track: 0, lift: 0, total: 0 };',
    'map[workout.workout_date] = emptyTrainingCounts();',
    "calendar workout counts",
)
text = replace_once(
    text,
    'map[assignment.scheduled_date] = { track: 0, lift: 0, total: 0 };',
    'map[assignment.scheduled_date] = emptyTrainingCounts();',
    "calendar assignment counts",
)

marker_start = '                {hasTrainingMarker && ('
start = text.index(marker_start)
end_marker = '                )}\n              </Pressable>'
end = text.index(end_marker, start)
new_markers = '''                {hasTrainingMarker && (
                  <View style={{ flexDirection: "row", gap: 3, marginTop: 4 }}>
                    {TRAINING_DOMAINS.map((domain) => {
                      const loggedCount = logged?.[domain.value] ?? 0;
                      const assignedCount = assigned?.[domain.value] ?? 0;
                      if (loggedCount === 0 && assignedCount === 0) return null;
                      const loggedMarker = loggedCount > 0;
                      return (
                        <View
                          key={domain.value}
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            borderWidth: loggedMarker ? 0 : 1.5,
                            borderColor: trainingColor(c, domain.value),
                            backgroundColor: loggedMarker
                              ? trainingColor(c, domain.value)
                              : c.card,
                          }}
                        />
                      );
                    })}
                  </View>
                )}'''
text = text[:start] + new_markers + text[end + len('                )}'):]

legend_start = text.index(
    '        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>',
    start,
)
legend_end_marker = '        </View>\n      </View>\n\n      <View'
legend_end = text.index(legend_end_marker, legend_start)
new_legend = '''        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: c.event }} />
            <Text style={{ color: c.subtext }}>event</Text>
          </View>
          {TRAINING_DOMAINS.map((domain) => (
            <View key={domain.value} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: trainingColor(c, domain.value),
                }}
              />
              <Text style={{ color: c.subtext }}>{domain.label.toLowerCase()}</Text>
            </View>
          ))}
          <Text style={{ color: c.subtext, fontSize: 12 }}>
            Outline = assigned · filled = logged
          </Text>
        </View>'''
text = text[:legend_start] + new_legend + text[legend_end:]

text = replace_once(
    text,
    'assignment.workout_type_snapshot === "lift" ? c.lift : c.track',
    'trainingColor(c, assignment.workout_type_snapshot)',
    "assignment color",
)
text = replace_once(
    text,
    'backgroundColor: workout.workout_type === "lift" ? c.lift : c.track,',
    'backgroundColor: trainingColor(c, workout.workout_type),',
    "workout color",
)
text = replace_once(
    text,
    'onPress={() => router.push(`/workout/${workout.id}`)}',
    'onPress={() => router.push(workoutHref(workout) as any)}',
    "field workout route",
)
text = replace_once(
    text,
    '''                {!!workout.notes && (
                  <Text numberOfLines={2} style={{ color: c.subtext }}>
                    {workout.notes}
                  </Text>
                )}''',
    '''                <Text style={{ color: c.subtext, fontSize: 12, fontWeight: "700" }}>
                  {trainingDomainLabel(workout.workout_type)}
                </Text>
                {!!workout.notes && (
                  <Text numberOfLines={2} style={{ color: c.subtext }}>
                    {workout.notes}
                  </Text>
                )}''',
    "calendar workout domain label",
)
calendar.write_text(text)
