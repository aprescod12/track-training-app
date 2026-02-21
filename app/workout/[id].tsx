import { useEffect, useState } from "react";
import { View, Text, ScrollView, Modal, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";

type Entry = {
  id: string;
  label: string;
  value: string | null;
  notes: string | null;
};

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_entries: Entry[];
};

export default function WorkoutDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workoutId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : undefined;

  const [item, setItem] = useState<Workout | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    if (!workoutId) return;
    setStatus("Loading...");

    const { data, error } = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes, workout_entries(id, label, value, notes)")
      .eq("id", workoutId)
      .single();

    if (error) {
      setStatus("Error: " + error.message);
      setItem(null);
      return;
    }

    setItem(data as any);
    setStatus("Loaded ✅");
  }

  useEffect(() => {
    load();
  }, [workoutId]);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>Workout</Text>
        <Text style={{ opacity: 0.7 }}>{status}</Text>
  
        {item && (
          <>
            <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ opacity: 0.7 }}>{item.workout_date}</Text>
              {!!item.notes && <Text>{item.notes}</Text>}
  
              <View style={{ gap: 10, marginTop: 6 }}>
                <PrimaryButton
                  title="Edit"
                  onPress={() => router.push(`/workout/${item.id}/edit`)}
                />
  
                <PrimaryButton
                    title="Delete"
                    onPress={() => setConfirmOpen(true)}
                />
              </View>
            </View>
  
            <Text style={{ fontWeight: "800" }}>Entries</Text>
  
            {item.workout_entries?.length ? (
              item.workout_entries.map((e) => (
                <View
                  key={e.id}
                  style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}
                >
                  <Text style={{ fontWeight: "700" }}>{e.label}</Text>
                  {!!e.value && <Text style={{ opacity: 0.8 }}>{e.value}</Text>}
                  {!!e.notes && <Text style={{ opacity: 0.8 }}>{e.notes}</Text>}
                </View>
              ))
            ) : (
              <Text style={{ opacity: 0.7 }}>No entries found.</Text>
            )}
          </>
        )}
      </ScrollView>
  
      <Modal visible={confirmOpen} transparent animationType="fade">
  <Pressable
    onPress={() => !deleting && setConfirmOpen(false)}
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    }}
  >
    <Pressable
      onPress={() => {}}
      style={{
        width: "100%",
        maxWidth: 420,
        backgroundColor: "white",
        borderWidth: 1,
        borderRadius: 16,
        padding: 18,
        gap: 14,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800" }}>
        Delete workout?
      </Text>

      <Text style={{ opacity: 0.75 }}>
        This will permanently delete the workout and all entries.
      </Text>

      {deleting && (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator />
          <Text>Deleting…</Text>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <PrimaryButton
          title="Cancel"
          onPress={() => setConfirmOpen(false)}
          disabled={deleting}
        />

        <PrimaryButton
          title="Delete permanently"
          disabled={deleting}
          onPress={async () => {
            if (!workoutId) return;

            try {
              setDeleting(true);
              setStatus("Deleting...");

              const { error } = await supabase
                .from("workouts")
                .delete()
                .eq("id", workoutId);

              if (error) {
                setStatus("Error: " + error.message);
                return;
              }

              setStatus("Deleted ✅");
              setConfirmOpen(false);
              router.replace("/(tabs)/log");
            } finally {
              setDeleting(false);
            }
          }}
        />
      </View>
    </Pressable>
  </Pressable>
</Modal>
    </>
  );
}