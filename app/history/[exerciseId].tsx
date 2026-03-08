import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import type { ScrollView as RNScrollView } from "react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { formatWorkoutType } from "../../lib/format";

type EntrySetRow = {
  set_number: number;
  rep_number: number | null;
  time_text: string | null;
  reps: number | null;
  weight: number | null;
};

type HistoryRow = {
  id: string;
  workouts: {
    workout_date: string; // YYYY-MM-DD
    workout_type: "track" | "lift" | string;
    title: string | null;
  } | null;
  exercises: { name: string } | null;
  entry_sets: EntrySetRow[] | null;
};

type ExercisePRRow = {
  user_id: string;
  exercise_id: string;

  best_time_sec: number | null;
  best_time_text: string | null;
  best_time_entry_id: string | null;
  best_time_set_number: number | null;
  best_time_rep_number: number | null;

  best_weight: number | null;
  best_reps: number | null;
  best_weight_entry_id: string | null;
  best_weight_set_number: number | null;

  updated_at: string;
};

function formatPrettyDate(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return ymd;

  const month = d.toLocaleString(undefined, { month: "long" });
  const dd = d.getDate();
  const year = d.getFullYear();

  const ordinal = (n: number) => {
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  };

  return `${month} ${ordinal(dd)}, ${year}`;
}

// Accepts: "28.7", "1:23.45", "01:23.45"
function parseTimeToSeconds(t: string): number | null {
  const s = (t ?? "").trim();
  if (!s) return null;

  if (s.includes(":")) {
    const [mm, rest] = s.split(":");
    const minutes = Number(mm);
    const seconds = Number(rest);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }

  const seconds = Number(s);
  if (!Number.isFinite(seconds)) return null;
  return seconds;
}

function formatSecondsToTimeText(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return "—";
  const sec = Math.max(0, totalSec);

  const minutes = Math.floor(sec / 60);
  const s = sec - minutes * 60;

  const sTxt = s.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

  if (minutes <= 0) return sTxt;
  const [whole, frac] = sTxt.split(".");
  const padWhole = whole.padStart(2, "0");
  return frac ? `${minutes}:${padWhole}.${frac}` : `${minutes}:${padWhole}`;
}

function ymdToMonthKey(ymd: string): string | null {
  const s = (ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s.slice(0, 7);
}

function ymdToYear(ymd: string): number | null {
  const s = (ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function SkeletonLine({
  w = "80%",
  h = 12,
  radius = 8,
}: {
  w?: number | string;
  h?: number;
  radius?: number;
}) {
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        opacity: 0.35,
        backgroundColor: "#999",
      }}
    />
  );
}

export default function ExerciseHistoryScreen() {
  const c = useAppColors();
  const { width: screenW } = useWindowDimensions();

  // vertical scroll
  const scrollRef = useRef<RNScrollView>(null);

  // horizontal refs:
  // date -> outer entry scroller
  const entryHScrollByDate = useRef<Record<string, RNScrollView | null>>({});
  // entryId -> inner set scroller
  const setHScrollByEntry = useRef<Record<string, RNScrollView | null>>({});

  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [rows, setRows] = useState<HistoryRow[]>([]);

  const [exerciseName, setExerciseName] = useState<string>("Exercise History");
  const [refreshing, setRefreshing] = useState(false);

  const [prRow, setPrRow] = useState<ExercisePRRow | null>(null);

  // date -> y for jump-to
  const [dateYMap, setDateYMap] = useState<Record<string, number>>({});

  // highlight a set card for a moment
  const [highlightSetKey, setHighlightSetKey] = useState<string | null>(null);

  // Responsive widths for nicer horizontal scrolling
  const entryCardW = useMemo(() => {
    return Math.max(260, Math.min(360, Math.round(screenW * 0.82)));
  }, [screenW]);

  const liftSetCardW = useMemo(
    () => Math.max(160, Math.min(200, Math.round(screenW * 0.48))),
    [screenW]
  );
  const trackSetCardW = useMemo(
    () => Math.max(200, Math.min(260, Math.round(screenW * 0.60))),
    [screenW]
  );

  // Keep this in sync with your contentContainerStyle gap values
  const H_GAP = 10;

  const load = useCallback(async () => {
    if (!exerciseId) return;
  
    setLoading(true);
    setStatus("Loading...");
  
    // ✅ get uid once
    const { data: u, error: uErr } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
  
    if (uErr || !uid) {
      setStatus("Not logged in");
      setRows([]);
      setExerciseName("Exercise History");
      setPrRow(null);
      setLoading(false);
      return;
    }
  
    const { data, error } = await supabase
      .from("workout_entries")
      .select(
        `
        id,
        workouts!inner(workout_date, workout_type, title),
        exercises(name),
        entry_sets(set_number, rep_number, time_text, reps, weight)
      `
      )
      .eq("user_id", uid) // ✅ CRITICAL FIX (only MY entries)
      .eq("exercise_id", exerciseId)
      .order("workout_date", { ascending: false, foreignTable: "workouts" })
      .order("set_number", { ascending: true, foreignTable: "entry_sets" })
      .order("rep_number", { ascending: true, foreignTable: "entry_sets" })
      .limit(500);
  
    if (error) {
      console.log("history load error:", error);
      setStatus("Error: " + error.message);
      setRows([]);
      setExerciseName("Exercise History");
      setPrRow(null);
      setLoading(false);
      return;
    }
  
    const nextRows = (data as any) ?? [];
    setRows(nextRows);
  
    // exercise name
    const fromRows = nextRows?.[0]?.exercises?.name?.trim();
    if (fromRows) {
      setExerciseName(fromRows);
    } else {
      const { data: ex, error: exErr } = await supabase
        .from("exercises")
        .select("name")
        .eq("exercise_id", exerciseId)
        .maybeSingle();
  
      if (!exErr && ex?.name) setExerciseName(ex.name);
      else setExerciseName("Exercise History");
    }
  
    // PR row (already correctly scoped by uid)
    try {
      const { data: pr, error: prErr } = await supabase
        .from("exercise_prs")
        .select(
          `
          user_id,
          exercise_id,
          best_time_sec,
          best_time_text,
          best_time_entry_id,
          best_time_set_number,
          best_time_rep_number,
          best_weight,
          best_reps,
          best_weight_entry_id,
          best_weight_set_number,
          updated_at
        `
        )
        .eq("user_id", uid)
        .eq("exercise_id", exerciseId)
        .maybeSingle();
  
      if (prErr) {
        console.log("exercise_prs load error:", prErr);
        setPrRow(null);
      } else {
        setPrRow((pr as any) ?? null);
      }
    } catch (e) {
      console.log("exercise_prs load exception:", e);
      setPrRow(null);
    }
  
    setStatus("Loaded ✅");
    setLoading(false);
  }, [exerciseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grouped = useMemo(() => {
    const map: Record<string, HistoryRow[]> = {};
    for (const r of rows) {
      const date = r.workouts?.workout_date;
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(r);
    }
    const dates = Object.keys(map).sort((a, b) => (a < b ? 1 : -1)); // desc
    return { map, dates };
  }, [rows]);

  const inferredType = useMemo<"track" | "lift">(() => {
    const hasTimes = rows.some((r) =>
      (r.entry_sets ?? []).some((s) => (s.time_text ?? "").trim())
    );
    return hasTimes ? "track" : "lift";
  }, [rows]);

  const insightsMode = useMemo<"track" | "lift">(() => {
    const hasTrackPr =
      prRow?.best_time_sec != null || (prRow?.best_time_text ?? "").trim().length > 0;
    const hasLiftPr = prRow?.best_weight != null;
    if (hasTrackPr && !hasLiftPr) return "track";
    if (hasLiftPr && !hasTrackPr) return "lift";
    return inferredType;
  }, [prRow, inferredType]);

  const best = useMemo(() => {
    if (!prRow) return null;

    if (prRow.best_time_sec != null && prRow.best_time_text) {
      const date =
        rows.find((r) => r.id === prRow.best_time_entry_id)?.workouts?.workout_date ??
        null;
      return { type: "track" as const, date, label: `Fastest: ${prRow.best_time_text}` };
    }

    if (prRow.best_weight != null) {
      const date =
        rows.find((r) => r.id === prRow.best_weight_entry_id)?.workouts?.workout_date ??
        null;
      const w = prRow.best_weight;
      const reps = prRow.best_reps;
      return {
        type: "lift" as const,
        date,
        label: reps != null ? `${reps} reps @ ${w}` : `Best weight: ${w}`,
      };
    }

    return null;
  }, [prRow, rows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const { bestSetKeyByDate, prSetKey, prMode, dayBest } = useMemo(() => {
    const bestSetKeyByDate: Record<string, string | null> = {};
    const keyFor = (entryId: string, setNum: number) => `${entryId}:${setNum}`;

    let prSetKey: string | null = null;
    let prMode: "track" | "lift" | null = null;

    if (prRow?.best_time_entry_id && prRow.best_time_set_number != null) {
      prSetKey = keyFor(prRow.best_time_entry_id, prRow.best_time_set_number);
      prMode = "track";
    } else if (prRow?.best_weight_entry_id && prRow.best_weight_set_number != null) {
      prSetKey = keyFor(prRow.best_weight_entry_id, prRow.best_weight_set_number);
      prMode = "lift";
    }

    const dayBest: Array<{
      date: string;
      mode: "track" | "lift";
      value: number;
      setKey: string | null;
    }> = [];

    for (const date of grouped.dates) {
      const list = grouped.map[date] ?? [];

      const workoutTypeRaw = list?.[0]?.workouts?.workout_type;
      const workoutType =
        workoutTypeRaw === "lift" || workoutTypeRaw === "track" ? workoutTypeRaw : inferredType;

      let bestKey: string | null = null;
      let bestValue = workoutType === "lift" ? -Infinity : Infinity;

      for (const r of list) {
        const sets = (r.entry_sets ?? []) as EntrySetRow[];

        const bySet: Record<number, EntrySetRow[]> = {};
        for (const s of sets) {
          const k = Number(s.set_number);
          if (!bySet[k]) bySet[k] = [];
          bySet[k].push(s);
        }

        const setNums = Object.keys(bySet).map(Number).sort((a, b) => a - b);

        for (const setNum of setNums) {
          const rowsForSet = bySet[setNum] ?? [];
          const setKey = keyFor(r.id, setNum);

          if (workoutType === "lift") {
            const row0 = rowsForSet[0];
            const ww = row0?.weight == null ? null : Number(row0.weight);
            if (ww != null && Number.isFinite(ww) && ww > bestValue) {
              bestValue = ww;
              bestKey = setKey;
            }
          } else {
            const secs = rowsForSet
              .map((x) => (x.time_text ?? "").trim())
              .map((t) => (t ? parseTimeToSeconds(t) : null))
              .filter((n): n is number => n != null && Number.isFinite(n));

            if (secs.length) {
              const avg = secs.reduce((a, b) => a + b, 0) / secs.length;
              if (avg < bestValue) {
                bestValue = avg;
                bestKey = setKey;
              }
            }
          }
        }
      }

      bestSetKeyByDate[date] = bestKey;

      if (
        (workoutType === "lift" && bestValue !== -Infinity && Number.isFinite(bestValue)) ||
        (workoutType === "track" && bestValue !== Infinity && Number.isFinite(bestValue))
      ) {
        dayBest.push({ date, mode: workoutType, value: bestValue, setKey: bestKey });
      }
    }

    return { bestSetKeyByDate, prSetKey, prMode, dayBest };
  }, [grouped.dates, grouped.map, inferredType, prRow]);

  // location of fastest rep this month (for jump-to)
  const fastestRepThisMonth = useMemo(() => {
    if (insightsMode !== "track") return null;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let best:
      | {
          sec: number;
          date: string;
          entryId: string;
          setNum: number;
        }
      | null = null;

    for (const r of rows) {
      const d = r.workouts?.workout_date;
      if (!d) continue;
      if (ymdToMonthKey(d) !== monthKey) continue;

      const bySet: Record<number, EntrySetRow[]> = {};
      for (const s of r.entry_sets ?? []) {
        const sn = Number(s.set_number);
        if (!bySet[sn]) bySet[sn] = [];
        bySet[sn].push(s);
      }

      for (const [setNumStr, reps] of Object.entries(bySet)) {
        const setNum = Number(setNumStr);
        for (const rep of reps) {
          const tt = (rep.time_text ?? "").trim();
          if (!tt) continue;
          const sec = parseTimeToSeconds(tt);
          if (sec == null) continue;

          if (!best || sec < best.sec) {
            best = { sec, date: d, entryId: r.id, setNum };
          }
        }
      }
    }

    if (!best) return null;

    return {
      monthKey,
      label: formatSecondsToTimeText(best.sec),
      date: best.date,
      setKey: `${best.entryId}:${best.setNum}`,
    };
  }, [rows, insightsMode]);

    // location of heaviest set this month (for jump-to) — LIFT
    const heaviestSetThisMonth = useMemo(() => {
        if (insightsMode !== "lift") return null;
    
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    
        const candidates = dayBest.filter((d) => d.mode === "lift" && ymdToMonthKey(d.date) === monthKey);
    
        if (!candidates.length) return null;
    
        // heaviest = max value
        let best = candidates[0];
        for (const c of candidates) {
          if (c.value > best.value) best = c;
        }
    
        if (!best.setKey) return null;
    
        return {
          monthKey,
          label: String(best.value),
          date: best.date,
          setKey: best.setKey,
        };
      }, [dayBest, insightsMode]);

  const insights = useMemo(() => {
    const last = dayBest[0] ?? null;
    const prev = dayBest[1] ?? null;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const year = now.getFullYear();

    const bestOfMode = dayBest.filter((d) => d.mode === insightsMode);
    const last4 = bestOfMode.slice(0, 4);

    const thisMonth = bestOfMode.filter((d) => ymdToMonthKey(d.date) === monthKey);
    const bestThisMonth =
      insightsMode === "track"
        ? thisMonth.reduce<{ date: string; value: number } | null>(
            (acc, cur) => (!acc || cur.value < acc.value ? { date: cur.date, value: cur.value } : acc),
            null
          )
        : thisMonth.reduce<{ date: string; value: number } | null>(
            (acc, cur) => (!acc || cur.value > acc.value ? { date: cur.date, value: cur.value } : acc),
            null
          );

    const thisYear = bestOfMode.filter((d) => ymdToYear(d.date) === year);
    const bestThisYear =
      insightsMode === "track"
        ? thisYear.reduce<{ date: string; value: number } | null>(
            (acc, cur) => (!acc || cur.value < acc.value ? { date: cur.date, value: cur.value } : acc),
            null
          )
        : thisYear.reduce<{ date: string; value: number } | null>(
            (acc, cur) => (!acc || cur.value > acc.value ? { date: cur.date, value: cur.value } : acc),
            null
          );

    const fastestRepThisMonthLabel = fastestRepThisMonth?.label ?? null;

    let deltaText: string | null = null;
    if (last && prev && last.mode === prev.mode && last.mode === insightsMode) {
      if (insightsMode === "track") {
        const delta = prev.value - last.value;
        const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
        const absTxt = Math.abs(delta).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
        deltaText = delta !== 0 ? `${sign}${absTxt}s vs previous` : "Same as previous";
      } else {
        const delta = last.value - prev.value;
        const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
        const absTxt = Math.abs(delta).toFixed(1).replace(/\.0$/, "");
        deltaText = delta !== 0 ? `${sign}${absTxt} vs previous` : "Same as previous";
      }
    }

    const lastLabel =
      insightsMode === "track"
        ? last && last.mode === "track"
          ? formatSecondsToTimeText(last.value)
          : "—"
        : last && last.mode === "lift"
          ? `${String(last.value)}`
          : "—";

    const last4Label =
      last4.length === 0
        ? null
        : insightsMode === "track"
          ? last4.map((x) => formatSecondsToTimeText(x.value)).join("  •  ")
          : last4.map((x) => String(x.value)).join("  •  ");

    const bestMonthLabel =
      bestThisMonth == null
        ? null
        : insightsMode === "track"
          ? formatSecondsToTimeText(bestThisMonth.value)
          : String(bestThisMonth.value);

    const bestYearLabel =
      bestThisYear == null
        ? null
        : insightsMode === "track"
          ? formatSecondsToTimeText(bestThisYear.value)
          : String(bestThisYear.value);

    const hasAny = bestOfMode.length > 0;
    const isSeasonPR =
      hasAny &&
      bestThisYear != null &&
      last != null &&
      last.mode === insightsMode &&
      ((insightsMode === "track" && last.value <= bestThisYear.value) ||
        (insightsMode === "lift" && last.value >= bestThisYear.value));

    const isAllTimePR =
      (insightsMode === "track" && prRow?.best_time_sec != null && last?.mode === "track"
        ? last.value <= prRow.best_time_sec
        : false) ||
      (insightsMode === "lift" && prRow?.best_weight != null && last?.mode === "lift"
        ? last.value >= prRow.best_weight
        : false);

    return {
      mode: insightsMode,
      lastLabel,
      deltaText,
      last4Label,
      bestMonthLabel,
      bestYearLabel,
      fastestRepThisMonthLabel,
      isSeasonPR,
      isAllTimePR,
      monthKey,
      year,
      hasAny,
    };
  }, [dayBest, insightsMode, prRow, fastestRepThisMonth, heaviestSetThisMonth]);

  const getWorkoutTypeForDate = useCallback(
    (date: string): "track" | "lift" => {
      const list = grouped.map[date] ?? [];
      const workoutTypeRaw = list?.[0]?.workouts?.workout_type;
      const workoutType =
        workoutTypeRaw === "lift" || workoutTypeRaw === "track" ? workoutTypeRaw : inferredType;
      return workoutType;
    },
    [grouped.map, inferredType]
  );

  const getSetIndexForEntry = useCallback(
    (entryId: string, setNum: number) => {
      // Find the entry in rows, then compute sorted setNums order
      const entry = rows.find((r) => r.id === entryId);
      if (!entry) return null;

      const bySet: Record<number, EntrySetRow[]> = {};
      for (const s of entry.entry_sets ?? []) {
        const k = Number(s.set_number);
        if (!bySet[k]) bySet[k] = [];
        bySet[k].push(s);
      }
      const setNums = Object.keys(bySet).map(Number).sort((a, b) => a - b);
      const idx = setNums.indexOf(setNum);
      return idx >= 0 ? idx : null;
    },
    [rows]
  );

  const jumpToDateAndHighlight = useCallback(
    (date: string, setKey?: string | null) => {
      const y = dateYMap[date];
      if (y == null) return;

      // 1) vertical
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });

      if (!setKey) return;

      // 2) highlight
      setHighlightSetKey(setKey);
      setTimeout(() => setHighlightSetKey(null), 1400);

      // parse setKey
      const [entryId, setNumStr] = setKey.split(":");
      const setNum = Number(setNumStr);
      if (!entryId || !Number.isFinite(setNum)) return;

      // 3) horizontal scroll(s) after layout settles
      setTimeout(() => {
        // outer entry scroll
        const list = grouped.map[date] ?? [];
        const entryIndex = list.findIndex((r) => r.id === entryId);
        if (entryIndex >= 0) {
          const x = entryIndex * (entryCardW + H_GAP);
          entryHScrollByDate.current[date]?.scrollTo({ x: Math.max(0, x - 8), animated: true });
        }

        // inner set scroll
        const workoutType = getWorkoutTypeForDate(date);
        const setIdx = getSetIndexForEntry(entryId, setNum);
        if (setIdx != null) {
          const setCardW = workoutType === "lift" ? liftSetCardW : trackSetCardW;
          const x2 = setIdx * (setCardW + H_GAP);
          setHScrollByEntry.current[entryId]?.scrollTo({ x: Math.max(0, x2 - 8), animated: true });
        }
      }, 80);
    },
    [
      dateYMap,
      grouped.map,
      entryCardW,
      liftSetCardW,
      trackSetCardW,
      getWorkoutTypeForDate,
      getSetIndexForEntry,
    ]
  );

  return (
    <FormScreen
      scrollRef={scrollRef}
      refreshControlProps={{
        refreshing,
        onRefresh,
      }}
    >
      {/* Header */}
<View style={{ gap: 6 }}>
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    }}
  >
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 22,
          fontWeight: "900",
          color: c.text,
          flexShrink: 1,
        }}
      >
        {exerciseName}
      </Text>
    </View>

    <Pressable
      onPress={() => router.back()}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 14,
        backgroundColor: c.card,
      }}
    >
      <Text style={{ fontWeight: "600", color: c.text }}>Back</Text>
    </Pressable>
  </View>

  <Text style={{ color: c.subtext }}>{status}</Text>
</View>

      {/* Progress Insights */}
      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontWeight: "900", color: c.text }}>Progress Insights</Text>

          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {insights.isSeasonPR ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontWeight: "900", fontSize: 11, color: c.text }}>SEASON PR</Text>
              </View>
            ) : null}

            {insights.isAllTimePR ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontWeight: "900", fontSize: 11, color: c.text }}>ALL-TIME PR</Text>
              </View>
            ) : null}
          </View>
        </View>

        {!insights.hasAny ? (
          <Text style={{ color: c.subtext }}>Log a few sets and you’ll start seeing trends here.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {/* Tap-to-jump: Last performance */}
              <Pressable
                onPress={() => {
                  const last = dayBest[0];
                  if (!last) return;
                  jumpToDateAndHighlight(last.date, last.setKey);
                }}
                style={{ flexGrow: 1, minWidth: 160, gap: 2 }}
              >
                <Text style={{ color: c.subtext }}>Last performance</Text>
                <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>
                  {insights.mode === "track" ? `${insights.lastLabel}s` : insights.lastLabel}
                </Text>
              </Pressable>

              <View style={{ flexGrow: 1, minWidth: 160, gap: 2 }}>
                <Text style={{ color: c.subtext }}>Change</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: c.text }}>
                  {insights.deltaText ?? "—"}
                </Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: c.subtext }}>Last 4 performances trend</Text>
              <Text style={{ fontWeight: "800", color: c.text }}>{insights.last4Label ?? "—"}</Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Pressable
                    onPress={() => {
                        if (insights.mode === "lift") {
                            if (!heaviestSetThisMonth) return;
                            jumpToDateAndHighlight(heaviestSetThisMonth.date, heaviestSetThisMonth.setKey);
                            return;
                        }

                        // track: optional — you can leave this as no-op, or jump to bestThisMonth if you want later
                    }}
                    style={{ flexGrow: 1, minWidth: 160, gap: 2 }}
                >
                    <Text style={{ color: c.subtext }}>
                    {insights.mode === "track" ? "Fastest this month" : "Heaviest this month"} ({insights.monthKey})
                    </Text>

                    <Text style={{ fontWeight: "900", color: c.text }}>
                        {insights.bestMonthLabel
                            ? insights.mode === "track"
                                ? `${insights.bestMonthLabel}s`
                                : insights.bestMonthLabel
                            : "—"}
                    </Text>
                </Pressable>

              {/* Tap-to-jump: Fastest Rep this Month */}
              <Pressable
                onPress={() => {
                  if (!fastestRepThisMonth) return;
                  jumpToDateAndHighlight(fastestRepThisMonth.date, fastestRepThisMonth.setKey);
                }}
                style={{ flexGrow: 1, minWidth: 160, gap: 2 }}
              >
                <Text style={{ color: c.subtext }}>
                  {insights.mode === "track"
                    ? `Fastest Rep this Month (${insights.monthKey})`
                    : `Season best (${insights.year})`}
                </Text>

                <Text style={{ fontWeight: "900", color: c.text }}>
                  {insights.mode === "track"
                    ? insights.fastestRepThisMonthLabel
                      ? `${insights.fastestRepThisMonthLabel}s`
                      : "—"
                    : insights.bestYearLabel
                      ? insights.bestYearLabel
                      : "—"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Best Performance Badge */}
      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "900", color: c.text }}>Best Performance</Text>

        {!best ? (
          <Text style={{ color: c.subtext }}>No recorded sets yet for this exercise.</Text>
        ) : (
          <>
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>{best.label}</Text>
            <Text style={{ color: c.subtext }}>{best.date ? `On ${formatPrettyDate(best.date)}` : ""}</Text>
          </>
        )}
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ marginTop: 12, gap: 12 }}>
          {[0, 1].map((k) => (
            <View
              key={k}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
                gap: 10,
              }}
            >
              <SkeletonLine w="45%" h={14} />
              <SkeletonLine w="35%" h={12} />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {[0, 1].map((j) => (
                  <View
                    key={j}
                    style={{
                      width: entryCardW,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 14,
                      padding: 12,
                      gap: 10,
                      opacity: 0.35,
                    }}
                  >
                    <SkeletonLine w="50%" h={12} />
                    <SkeletonLine w="80%" h={12} />
                    <SkeletonLine w="70%" h={12} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: c.subtext }}>Loading history…</Text>
          </View>
        </View>
      ) : grouped.dates.length === 0 ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text style={{ color: c.subtext }}>No history for this exercise yet.</Text>
          <Text style={{ color: c.subtext }}>Tip: log a workout with this exercise to start seeing trends and PRs.</Text>
        </View>
      ) : (
        <View style={{ marginTop: 12, gap: 12 }}>
          {grouped.dates.map((date) => {
            const list = grouped.map[date] ?? [];
            const workoutTitle = list?.[0]?.workouts?.title ?? null;
            const workoutTypeRaw = list?.[0]?.workouts?.workout_type;
            const workoutType =
              workoutTypeRaw === "lift" || workoutTypeRaw === "track" ? workoutTypeRaw : inferredType;

            const bestKeyForDay = bestSetKeyByDate[date] ?? null;

            return (
              <View
                key={date}
                onLayout={(e) => {
                  const y = e.nativeEvent.layout.y;
                  setDateYMap((prev) => (prev[date] === y ? prev : { ...prev, [date]: y }));
                }}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  borderRadius: 14,
                  padding: 14,
                  gap: 8,
                }}
              >
                <Text style={{ fontWeight: "900", color: c.text }}>{formatPrettyDate(date)}</Text>
                <Text style={{ color: c.subtext }}>
                  {formatWorkoutType(workoutType)} {workoutTitle ? ` • ${workoutTitle}` : ""}
                </Text>

                <ScrollView
                  ref={(ref) => {
                    entryHScrollByDate.current[date] = ref;
                  }}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                >
                  {list.map((r) => {
                    const sets = (r.entry_sets ?? []) as EntrySetRow[];

                    const bySet: Record<number, EntrySetRow[]> = {};
                    for (const s of sets) {
                      const k = Number(s.set_number);
                      if (!bySet[k]) bySet[k] = [];
                      bySet[k].push(s);
                    }
                    const setNums = Object.keys(bySet).map(Number).sort((a, b) => a - b);

                    return (
                      <View
                        key={r.id}
                        style={{
                          width: entryCardW,
                          borderWidth: 1,
                          borderColor: c.border,
                          backgroundColor: c.bg,
                          borderRadius: 14,
                          padding: 12,
                          gap: 10,
                        }}
                      >
                        {setNums.length === 0 ? (
                          <Text style={{ color: c.subtext }}>No sets recorded.</Text>
                        ) : (
                          <ScrollView
                            ref={(ref) => {
                              setHScrollByEntry.current[r.id] = ref;
                            }}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 10 }}
                          >
                            {setNums.map((setNum) => {
                              const rowsForSet = bySet[setNum] ?? [];
                              const setKey = `${r.id}:${setNum}`;

                              const isHighlighted = highlightSetKey === setKey;
                              const isBestOfDay = bestKeyForDay === setKey;

                              const isPR =
                                prSetKey === setKey &&
                                ((prMode === "track" && workoutType === "track") ||
                                  (prMode === "lift" && workoutType === "lift"));

                              if (workoutType === "lift") {
                                const row = rowsForSet[0];
                                if (!row) return null;

                                const reps = row.reps ?? "—";
                                const w = row.weight != null ? String(row.weight) : "";

                                return (
                                  <View
                                    key={setNum}
                                    style={{
                                      width: liftSetCardW,
                                      borderWidth: isHighlighted ? 2 : 1,
                                      borderColor: isHighlighted ? c.text : c.border,
                                      backgroundColor: c.card,
                                      borderRadius: 14,
                                      padding: 12,
                                      gap: 6,
                                    }}
                                  >
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                      <Text style={{ fontWeight: "900", color: c.text }}>
                                        Set {setNum} {isBestOfDay ? "⭐" : ""}
                                      </Text>

                                      {isPR ? (
                                        <View
                                          style={{
                                            borderWidth: 1,
                                            borderColor: c.border,
                                            backgroundColor: c.bg,
                                            borderRadius: 999,
                                            paddingHorizontal: 8,
                                            paddingVertical: 2,
                                          }}
                                        >
                                          <Text style={{ fontWeight: "900", fontSize: 11, color: c.text }}>PR</Text>
                                        </View>
                                      ) : null}
                                    </View>

                                    <Text style={{ color: c.subtext }} numberOfLines={2}>
                                      {reps} reps {w ? `@ ${w}` : ""}
                                    </Text>
                                  </View>
                                );
                              }

                              const times = rowsForSet.map((x) => (x.time_text ?? "").trim()).filter(Boolean);

                              return (
                                <View
                                  key={setNum}
                                  style={{
                                    width: trackSetCardW,
                                    borderWidth: isHighlighted ? 2 : 1,
                                    borderColor: isHighlighted ? c.text : c.border,
                                    backgroundColor: c.card,
                                    borderRadius: 14,
                                    padding: 12,
                                    gap: 6,
                                  }}
                                >
                                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                    <Text style={{ fontWeight: "900", color: c.text }}>
                                      Set {setNum} {isBestOfDay ? "⭐" : ""}
                                    </Text>

                                    {isPR ? (
                                      <View
                                        style={{
                                          borderWidth: 1,
                                          borderColor: c.border,
                                          backgroundColor: c.bg,
                                          borderRadius: 999,
                                          paddingHorizontal: 8,
                                          paddingVertical: 2,
                                        }}
                                      >
                                        <Text style={{ fontWeight: "900", fontSize: 11, color: c.text }}>PR</Text>
                                      </View>
                                    ) : null}
                                  </View>

                                  {times.length ? (
                                    <Text style={{ color: c.subtext }} numberOfLines={3}>
                                      {times.join(" • ")}
                                    </Text>
                                  ) : (
                                    <Text style={{ color: c.subtext }}>No times.</Text>
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
        </View>
      )}
    </FormScreen>
  );
}