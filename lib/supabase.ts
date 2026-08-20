// lib/supabase.ts
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getEnvironmentConfig } from "./environment";

const { supabaseUrl, supabaseAnonKey } = getEnvironmentConfig();

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type WorkoutEntryTable = Database["public"]["Tables"]["workout_entries"];

// PostgreSQL exposes text[] without preserving array dimensions in generated types.
// Track workouts intentionally store set_times as a two-dimensional text array.
type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "workout_entries"> & {
      workout_entries: Omit<WorkoutEntryTable, "Row" | "Insert" | "Update"> & {
        Row: Omit<WorkoutEntryTable["Row"], "set_times"> & {
          set_times: string[][] | null;
        };
        Insert: Omit<WorkoutEntryTable["Insert"], "set_times"> & {
          set_times?: string[][] | null;
        };
        Update: Omit<WorkoutEntryTable["Update"], "set_times"> & {
          set_times?: string[][] | null;
        };
      };
    };
  };
};

const noopStorage: StorageLike = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

function getStorage(): StorageLike {
  // Native: load AsyncStorage lazily (so web SSR never evaluates it)
  if (Platform.OS !== "web") {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    return AsyncStorage;
  }

  // Web SSR: no window
  if (typeof window === "undefined") return noopStorage;

  // Web client: use localStorage
  return {
    getItem: async (key) => window.localStorage.getItem(key),
    setItem: async (key, value) => window.localStorage.setItem(key, value),
    removeItem: async (key) => window.localStorage.removeItem(key),
  };
}

export const supabase = createClient<AppDatabase>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    persistSession: true,
    autoRefreshToken: true,
    // for RN + Expo Router, usually false is correct
    detectSessionInUrl: false,
  },
});
