export type AppEnvironment = "local" | "staging" | "production";

export const STAGING_SUPABASE_PROJECT_REF = "pxkpfgultgopernrmqzv";

type EnvironmentInput = {
  appEnvironment?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export type EnvironmentConfig = {
  appEnvironment: AppEnvironment;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseProjectRef: string | null;
};

function normalizeAppEnvironment(value?: string): AppEnvironment {
  // Keep local development backward-compatible when EXPO_PUBLIC_APP_ENV has
  // not been added to a developer's ignored .env.local yet. EAS preview and
  // production builds set this value explicitly in eas.json.
  if (!value) return "local";

  if (value === "local" || value === "staging" || value === "production") {
    return value;
  }

  throw new Error(
    `Invalid EXPO_PUBLIC_APP_ENV "${value}". Expected local, staging, or production.`
  );
}

function parseSupabaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  const hostParts = url.hostname.split(".");
  const projectRef =
    url.hostname.endsWith(".supabase.co") && hostParts.length >= 3
      ? hostParts[0]
      : null;

  return { url, projectRef };
}

export function validateEnvironmentConfig(input: EnvironmentInput): EnvironmentConfig {
  const appEnvironment = normalizeAppEnvironment(input.appEnvironment);
  const supabaseUrl = input.supabaseUrl?.trim();
  const supabaseAnonKey = input.supabaseAnonKey?.trim();

  if (!supabaseUrl) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL.");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (supabaseAnonKey.startsWith("sb_secret_")) {
    throw new Error(
      "A Supabase secret key cannot be used in EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const { url, projectRef } = parseSupabaseUrl(supabaseUrl);

  if (appEnvironment === "staging" && projectRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(
      "Staging builds must connect to the Track Training staging/pilot Supabase project."
    );
  }

  if (appEnvironment === "production") {
    if (projectRef === STAGING_SUPABASE_PROJECT_REF) {
      throw new Error(
        "Production builds cannot connect to the staging/pilot Supabase project."
      );
    }

    if (url.protocol !== "https:") {
      throw new Error("Production Supabase URLs must use HTTPS.");
    }
  }

  return {
    appEnvironment,
    supabaseUrl,
    supabaseAnonKey,
    supabaseProjectRef: projectRef,
  };
}

export function getEnvironmentConfig(): EnvironmentConfig {
  return validateEnvironmentConfig({
    // Expo statically inlines EXPO_PUBLIC_* variables when accessed with dot
    // notation, so keep these references explicit rather than dynamic.
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
}
