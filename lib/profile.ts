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
  if (authErr) throw authErr;

  const user = authData.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateMyProfile(patch: Partial<Profile>) {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const user = authData.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}