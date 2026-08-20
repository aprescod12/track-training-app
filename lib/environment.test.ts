import {
  STAGING_SUPABASE_PROJECT_REF,
  validateEnvironmentConfig,
} from "./environment";

const stagingUrl = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
const anonKey = "test-anon-key";

describe("validateEnvironmentConfig", () => {
  it("defaults unspecified app environment to local for developer compatibility", () => {
    const config = validateEnvironmentConfig({
      supabaseUrl: stagingUrl,
      supabaseAnonKey: anonKey,
    });

    expect(config.appEnvironment).toBe("local");
    expect(config.supabaseProjectRef).toBe(STAGING_SUPABASE_PROJECT_REF);
  });

  it("allows staging builds to use the staging project", () => {
    const config = validateEnvironmentConfig({
      appEnvironment: "staging",
      supabaseUrl: stagingUrl,
      supabaseAnonKey: anonKey,
    });

    expect(config.appEnvironment).toBe("staging");
  });

  it("rejects staging builds pointed at another Supabase project", () => {
    expect(() =>
      validateEnvironmentConfig({
        appEnvironment: "staging",
        supabaseUrl: "https://differentproject.supabase.co",
        supabaseAnonKey: anonKey,
      })
    ).toThrow("Staging builds must connect");
  });

  it("rejects production builds pointed at the staging project", () => {
    expect(() =>
      validateEnvironmentConfig({
        appEnvironment: "production",
        supabaseUrl: stagingUrl,
        supabaseAnonKey: anonKey,
      })
    ).toThrow("Production builds cannot connect");
  });

  it("allows production builds pointed at a different HTTPS project", () => {
    const config = validateEnvironmentConfig({
      appEnvironment: "production",
      supabaseUrl: "https://futureproduction.supabase.co",
      supabaseAnonKey: anonKey,
    });

    expect(config.appEnvironment).toBe("production");
    expect(config.supabaseProjectRef).toBe("futureproduction");
  });

  it("rejects Supabase secret keys in public client configuration", () => {
    expect(() =>
      validateEnvironmentConfig({
        appEnvironment: "local",
        supabaseUrl: stagingUrl,
        supabaseAnonKey: "sb_secret_do-not-expose",
      })
    ).toThrow("secret key cannot be used");
  });

  it("requires both Supabase client variables", () => {
    expect(() =>
      validateEnvironmentConfig({
        appEnvironment: "local",
        supabaseAnonKey: anonKey,
      })
    ).toThrow("Missing EXPO_PUBLIC_SUPABASE_URL");

    expect(() =>
      validateEnvironmentConfig({
        appEnvironment: "local",
        supabaseUrl: stagingUrl,
      })
    ).toThrow("Missing EXPO_PUBLIC_SUPABASE_ANON_KEY");
  });
});
