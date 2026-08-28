import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../lib/theme";
import {
  JUMP_EVENTS,
  THROW_EVENTS,
  type FieldTrainingDomain,
} from "../../lib/trainingDomains";

type BestRow = {
  user_id: string | null;
  event_code: string | null;
  implement_weight_kg: number | null;
  best_mark_m: number | null;
};

type RecentFieldWorkout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
};

function prettyDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function FieldStatsScreen() {
  const c = useAppColors();
  const params = useLocalSearchParams<{ domain?: string | string[] }>();
  const rawDomain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const [domain, setDomain] = useState<FieldTrainingDomain>(rawDomain === "throws" ? "throws" : "jumps");
  const [bests, setBests] = useState<BestRow[]>([]);
  const [recent, setRecent] = useState<RecentFieldWorkout[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventOptions = domain === "jumps" ? JUMP_EVENTS : THROW_EVENTS;
  const eventOrder = useMemo(
    () => new Map(eventOptions.map((event, index) => [event.value, index])),
    [eventOptions]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (userError || !uid) throw userError ?? new Error("Please sign in again.");

      const eventCodes = (domain === "jumps" ? JUMP_EVENTS : THROW_EVENTS).map((event) => event.value);
      const [bestRes, recentRes, countRes] = await Promise.all([
        supabase
          .from("field_event_bests_v")
          .select("user_id, event_code, implement_weight_kg, best_mark_m")
          .eq("user_id", uid)
          .in("event_code", eventCodes),
        supabase
          .from("workouts")
          .select("id, workout_date, title, notes")
          .eq("user_id", uid)
          .eq("workout_type", domain)
          .order("workout_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("workouts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("workout_type", domain),
      ]);

      if (bestRes.error) throw bestRes.error;
      if (recentRes.error) throw recentRes.error;
      if (countRes.error) throw countRes.error;

      const sorted = [...(bestRes.data ?? [])].sort((a, b) => {
        const eventA = eventOrder.get(a.event_code as any) ?? 999;
        const eventB = eventOrder.get(b.event_code as any) ?? 999;
        if (eventA !== eventB) return eventA - eventB;
        return Number(a.implement_weight_kg ?? 0) - Number(b.implement_weight_kg ?? 0);
      });

      setBests(sorted as BestRow[]);
      setRecent((recentRes.data ?? []) as RecentFieldWorkout[]);
      setSessionCount(countRes.count ?? 0);
    } catch (loadError: any) {
      const message = String(loadError?.message ?? loadError ?? "");
      setError(
        message.toLowerCase().includes("field_event_bests_v") || message.toLowerCase().includes("schema cache")
          ? "Field stats are not available in this environment until the field-event migration is applied."
          : message || "Could not load field stats."
      );
      setBests([]);
      setRecent([]);
      setSessionCount(0);
    } finally {
      setLoading(false);
    }
  }, [domain, eventOrder]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const groupedBests = useMemo(() => {
    const groups = new Map<string, BestRow[]>();
    for (const row of bests) {
      if (!row.event_code) continue;
      const current = groups.get(row.event_code) ?? [];
      current.push(row);
      groups.set(row.event_code, current);
    }
    return groups;
  }, [bests]);

  const accent = domain === "jumps" ? c.jumps : c.throws;

  return (
    <FormScreen contentContainerStyle={{ width: "100%", maxWidth: 900, alignSelf: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "900" }}>Field Stats</Text>
          <Text style={{ color: c.subtext }}>
            Practice marks and training bests for jumps and throws. Competition and wind validation are separate future features.
          </Text>
        </View>
        <PrimaryButton
          title={`Log ${domain === "jumps" ? "jumps" : "throws"}`}
          onPress={() => router.push(`/field-log?domain=${domain}`)}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 4,
          gap: 4,
        }}
      >
        {(["jumps", "throws"] as FieldTrainingDomain[]).map((value) => {
          const selected = value === domain;
          return (
            <Pressable
              key={value}
              onPress={() => setDomain(value)}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: selected ? c.primary : "transparent",
              }}
            >
              <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: "800" }}>
                {value === "jumps" ? "Jumps" : "Throws"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "700" }}>{error}</Text>}

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Loading field stats…</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 16,
                padding: 14,
                gap: 5,
              }}
            >
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Sessions</Text>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: "900" }}>{sessionCount}</Text>
              <Text style={{ color: c.subtext, fontSize: 12 }}>All-time {domain}</Text>
            </View>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 16,
                padding: 14,
                gap: 5,
              }}
            >
              <Text style={{ color: c.subtext, fontWeight: "700" }}>Training Bests</Text>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: "900" }}>{bests.length}</Text>
              <Text style={{ color: c.subtext, fontSize: 12 }}>Measured performance groups</Text>
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 18,
              padding: 16,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: accent }} />
              <Text style={{ color: c.text, fontSize: 17, fontWeight: "900" }}>Training Bests</Text>
            </View>

            {eventOptions.map((event) => {
              const rows = groupedBests.get(event.value) ?? [];
              return (
                <View
                  key={event.value}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 14,
                    padding: 12,
                    gap: 7,
                  }}
                >
                  <Text style={{ color: c.text, fontWeight: "900" }}>{event.label}</Text>
                  {rows.length === 0 ? (
                    <Text style={{ color: c.subtext }}>No measured training best yet.</Text>
                  ) : (
                    rows.map((row, index) => (
                      <View
                        key={`${row.event_code}-${row.implement_weight_kg ?? "none"}-${index}`}
                        style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}
                      >
                        <Text style={{ color: c.subtext }}>
                          {domain === "throws" && row.implement_weight_kg != null
                            ? `${Number(row.implement_weight_kg)} kg implement`
                            : "Best valid mark"}
                        </Text>
                        <Text style={{ color: c.text, fontSize: 17, fontWeight: "900" }}>
                          {row.best_mark_m != null ? `${Number(row.best_mark_m).toFixed(2)} m` : "—"}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 18,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "900" }}>
              Recent {domain === "jumps" ? "Jump" : "Throw"} Sessions
            </Text>
            {recent.length === 0 ? (
              <Text style={{ color: c.subtext }}>No {domain} workouts logged yet.</Text>
            ) : (
              recent.map((workout) => (
                <Pressable
                  key={workout.id}
                  onPress={() => router.push(`/field-workout/${workout.id}`)}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 14,
                    padding: 12,
                    gap: 5,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{workout.title}</Text>
                    <Text style={{ color: c.subtext }}>{prettyDate(workout.workout_date)}</Text>
                  </View>
                  {!!workout.notes && (
                    <Text numberOfLines={2} style={{ color: c.subtext }}>
                      {workout.notes}
                    </Text>
                  )}
                  <Text style={{ color: c.text, fontWeight: "800" }}>View attempts →</Text>
                </Pressable>
              ))
            )}
          </View>
        </>
      )}
    </FormScreen>
  );
}
