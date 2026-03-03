require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

function parseSetTimes(set_times) {
  if (!Array.isArray(set_times)) return [];

  if (Array.isArray(set_times[0])) {
    return set_times.map((row) => row.map((t) => String(t)));
  }

  const all = [];

  for (const el of set_times) {
    if (el == null) continue;
    const s = String(el).trim();
    if (!s) continue;

    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          all.push(arr.map((t) => String(t)));
          continue;
        }
      } catch {}
    }

    if (!all.length) all.push([]);
    all[0].push(s);
  }

  return all;
}

async function main() {
  const { data: entries, error } = await supabase
    .from("workout_entries")
    .select("id, set_times, lift_reps, lift_weights")
    .order("created_at", { ascending: true });

  if (error) throw error;

  let totalSets = 0;

  for (const e of entries || []) {
    await supabase.from("entry_sets").delete().eq("entry_id", e.id);

    const rows = [];

    // LIFT
    if (Array.isArray(e.lift_reps) || Array.isArray(e.lift_weights)) {
      const repsArr = Array.isArray(e.lift_reps) ? e.lift_reps : [];
      const wArr = Array.isArray(e.lift_weights) ? e.lift_weights : [];
      const n = Math.max(repsArr.length, wArr.length);

      for (let i = 0; i < n; i++) {
        const reps = repsArr[i] ?? null;
        const weight = wArr[i] ?? null;
        if (reps == null && weight == null) continue;

        rows.push({
          entry_id: e.id,
          set_number: i + 1,
          rep_number: 1,
          reps,
          weight,
        });
      }
    }

    // TRACK
    const sets = parseSetTimes(e.set_times);
    for (let s = 0; s < sets.length; s++) {
      for (let r = 0; r < (sets[s] || []).length; r++) {
        const t = (sets[s][r] || "").trim();
        if (!t) continue;

        rows.push({
          entry_id: e.id,
          set_number: s + 1,
          rep_number: r + 1,
          time_text: t,
        });
      }
    }

    if (rows.length) {
      const { error: insErr } = await supabase.from("entry_sets").insert(rows);
      if (insErr) throw insErr;
      totalSets += rows.length;
    }
  }

  console.log(`Backfill complete. Inserted ${totalSets} entry_sets rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});