import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "./admin";
import { ApiError } from "./errors";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  vi.unstubAllGlobals();
});

describe("createSupabaseAdminClient", () => {
  it("fails closed without configuration, without leaking any key material", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createSupabaseAdminClient()).toThrowError(ApiError);
    try {
      createSupabaseAdminClient();
    } catch (error) {
      expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
      expect((error as Error).message).not.toMatch(/key/i);
    }
  });

  it("fails closed on the client even when configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-not-a-real-key";
    vi.stubGlobal("window", {});

    expect(() => createSupabaseAdminClient()).toThrowError(/server-only/);
  });

  it("creates a client on the server when configured (no network call)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-not-a-real-key";

    const client = createSupabaseAdminClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });
});
