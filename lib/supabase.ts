// lib/supabase.ts
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    persistSession: true,
    autoRefreshToken: true,
    // for RN + Expo Router, usually false is correct
    detectSessionInUrl: false,
  },
});