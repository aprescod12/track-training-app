import { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import PrimaryButton from "../../../components/PrimaryButton";
import { supabase } from "../../../lib/supabase";

type EntryRow = { id: string; label: string };

export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<string[]>([""]);

  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;

    setStatus("Loading...");
    const { data, error } = await supabase
      .from("workouts")
      .select("id, title, notes, workout_entries(id, label)")
      .eq("id", id)
      .single();

    if (error) {
      setStatus("Error: " + error.message);
      return;
    }

    setTitle(data.title ?? "");
    setNotes(data.notes ?? "");

    const entryLabels =
      (data.workout_entries as EntryRow[] | null)?.map((e) => e.label) ?? [];

    setEntries(entryLabels.length ? entryLabels : [""]);
    setStatus("Ready ✅");
  }

  useEffect(() => {
    load();
  }, [id]);

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

  async function save() {
    if (!id) return;

    try {
      setSaving(true);
      setStatus("Saving...");

      const trimmedTitle = title.trim() || "Workout";
      const cleanedEntries = entries.map((e) => e.trim()).filter(Boolean);

      // 1) Update workout
      const { error: wErr } = await supabase
        .from("workouts")
        .update({ title: trimmedTitle, notes })
        .eq("id", id);

      if (wErr) throw wErr;

      // 2) Replace entries (simple MVP approach)
      const { error: delErr } = await supabase
        .from("workout_entries")
        .delete()
        .eq("workout_id", id);

      if (delErr) throw delErr;

      if (cleanedEntries.length) {
        const payload = cleanedEntries.map((label) => ({
          workout_id: id,
          label,
        }));

        const { error: insErr } = await supabase
          .from("workout_entries")
          .insert(payload);

        if (insErr) throw insErr;
      }

      setStatus("Saved ✅");
      router.back(); // back to detail screen
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Edit Workout" }} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ opacity: 0.7 }}>{status}</Text>

        <Text style={{ fontWeight: "800" }}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Workout title"
          style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
        />

        <Text style={{ fontWeight: "800" }}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          multiline
          style={{ borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80 }}
        />

        <Text style={{ fontWeight: "800" }}>Entries</Text>

        {entries.map((entry, index) => (
          <View key={index} style={{ gap: 6 }}>
            <TextInput
              value={entry}
              onChangeText={(v) => updateEntry(index, v)}
              placeholder={`Entry ${index + 1}`}
              style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
            />
            <Pressable onPress={() => removeEntry(index)}>
              <Text style={{ color: "red" }}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <PrimaryButton title="Add entry" onPress={addEntry} />

        <PrimaryButton title={saving ? "Saving..." : "Save changes"} onPress={save} />

        <PrimaryButton title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}