import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { router } from "expo-router";
import PrimaryButton from "../components/PrimaryButton";
import { supabase } from "../lib/supabase";
import { formatYMD } from "../lib/date";
import { useLocalSearchParams } from "expo-router";

type ToastState = { open: boolean; message: string };

export default function ModalScreen() {
  const params = useLocalSearchParams<{ date?: string }>();

const [date] = useState(() =>
  typeof params.date === "string"
    ? params.date
    : formatYMD(new Date())
);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const [entries, setEntries] = useState<string[]>([""]);

  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "Workout saved",
  });

  // --- Toast animation ---
  const translateY = useRef(new Animated.Value(30)).current; // starts slightly down
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = (message: string) => {
    setToast({ open: true, message });

    // reset first (in case it was mid-animation)
    translateY.setValue(30);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 18,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setToast((t) => ({ ...t, open: false })));
  };

  // Auto-dismiss + navigate back to Log
  useEffect(() => {
    if (!toast.open) return;

    const t = setTimeout(() => {
      hideToast();
      // This will “close” modal routing and land on log tab.
      router.replace("/(tabs)/log");
    }, 900);

    return () => clearTimeout(t);
  }, [toast.open]);

  // --- Entries helpers ---
  function addEntry() {
    setEntries((prev) => [...prev, ""]);
  }
  function updateEntry(index: number, value: string) {
    setEntries((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }
  function removeEntry(index: number) {
    setEntries((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      return copy.length ? copy : [""];
    });
  }

  async function saveWorkout() {
    try {
      setSaving(true);
      setStatus(null);

      const trimmedTitle = title.trim() || "Workout";
      const cleanedEntries = entries.map((e) => e.trim()).filter(Boolean);

      const { data: workout, error: wErr } = await supabase
        .from("workouts")
        .insert({ workout_date: date, title: trimmedTitle, notes, workout_type: workoutType })
        .select()
        .single();

      if (wErr) throw wErr;

      if (cleanedEntries.length) {
        const payload = cleanedEntries.map((label) => ({
          workout_id: workout.id,
          label,
        }));
        const { error: eErr } = await supabase.from("workout_entries").insert(payload);
        if (eErr) throw eErr;
      }

      // Sleek toast
      showToast("Workout saved ✅");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 6,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ fontWeight: "600" }}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>Log Workout</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setWorkoutType("track")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: workoutType === "track" ? "black" : "transparent",
            }}
          >
            <Text style={{ fontWeight: "700", color: workoutType === "track" ? "white" : "black" }}>
              Track
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setWorkoutType("lift")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: workoutType === "lift" ? "black" : "transparent",
            }}
          >
            <Text style={{ fontWeight: "700", color: workoutType === "lift" ? "white" : "black" }}>
              Lift
            </Text>
          </Pressable>
        </View>

        <Text style={{ opacity: 0.7 }}>Date</Text>
        <Text style={{ fontWeight: "700" }}>{date}</Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Workout title"
          style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
        />

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
          style={{ borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80 }}
        />

        <Text style={{ fontWeight: "700" }}>Entries</Text>

        {entries.map((entry, index) => (
          <View key={index} style={{ gap: 6 }}>
            <TextInput
              value={entry}
              onChangeText={(value) => updateEntry(index, value)}
              placeholder={`Entry ${index + 1}`}
              style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
            />
            <Pressable onPress={() => removeEntry(index)}>
              <Text style={{ color: "red" }}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <PrimaryButton title="Add another entry" onPress={addEntry} />

        <Pressable
          onPress={saveWorkout}
          disabled={saving}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ fontSize: 16, fontWeight: "600" }}>Saving…</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Save workout</Text>
          )}
        </Pressable>

        {!!status && <Text style={{ marginTop: 6 }}>{status}</Text>}
      </ScrollView>

      {/* Toast */}
      {toast.open && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 18,
            paddingHorizontal: 16,
          }}
        >
          <Pressable onPress={() => { hideToast(); router.replace("/(tabs)/log"); }}>
            <Animated.View
              style={{
                transform: [{ translateY }],
                opacity,
                borderWidth: 1,
                borderRadius: 18,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: "white",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    borderWidth: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900" }}>✓</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800" }}>{toast.message}</Text>
                  <Text style={{ opacity: 0.7 }}>Back to Workouts…</Text>
                </View>

                <Text style={{ opacity: 0.7 }}>Tap</Text>
              </View>
            </Animated.View>
          </Pressable>
        </View>
      )}
    </View>
  );
}