import { AppError, toAppError } from "./errors";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  school: string | null;
  team: string | null;
  grad_year: number | null;
  events: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function getMyProfile() {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    throw toAppError(authErr, {
      fallbackMessage: "Could not verify your session. Please sign in again.",
    });
  }

  const user = authData.user;
  if (!user) {
    throw new AppError({
      kind: "auth",
      code: "not_authenticated",
      message: "Please sign in to continue.",
    });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    throw toAppError(error, {
      fallbackMessage: "Could not load your profile. Please try again.",
    });
  }

  return data as Profile;
}

export async function updateMyProfile(patch: Partial<Profile>) {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    throw toAppError(authErr, {
      fallbackMessage: "Could not verify your session. Please sign in again.",
    });
  }

  const user = authData.user;
  if (!user) {
    throw new AppError({
      kind: "auth",
      code: "not_authenticated",
      message: "Please sign in to continue.",
    });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    throw toAppError(error, {
      fallbackMessage: "Could not update your profile. Please try again.",
    });
  }

  return data as Profile;
}
