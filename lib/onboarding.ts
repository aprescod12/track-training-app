import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const ONBOARDING_VERSION = "pilot-v1";
const ONBOARDING_KEY_PREFIX = "track-training:onboarding";

export function onboardingStorageKey(userId: string) {
  return `${ONBOARDING_KEY_PREFIX}:${ONBOARDING_VERSION}:${userId}`;
}

export async function markOnboardingComplete(userId: string) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(onboardingStorageKey(userId), "complete");
  } catch {
    // Onboarding is guidance, never an authorization or app-access gate.
  }
}

export async function shouldShowOnboarding(userId: string) {
  if (!userId) return false;

  try {
    const stored = await AsyncStorage.getItem(onboardingStorageKey(userId));
    if (stored === "complete") return false;
  } catch {
    // If local storage is unavailable, fail open to the app rather than blocking login.
    return false;
  }

  const { count, error } = await supabase
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return false;

  if ((count ?? 0) > 0) {
    await markOnboardingComplete(userId);
    return false;
  }

  return true;
}

export async function getSignedInLandingRoute(userId?: string | null) {
  if (!userId) return "/(tabs)" as const;
  return (await shouldShowOnboarding(userId))
    ? ("/onboarding" as const)
    : ("/(tabs)" as const);
}
