import { notFound } from "next/navigation";

import DevAuthTestClient from "./dev-auth-test-client";

export const metadata = {
  title: "Dev auth test (development only)",
};

/**
 * Development-only login/test page for verifying the Supabase SSR cookie
 * flow against the real API routes. In production this route is a 404:
 * the check runs on the server, so the test UI is never rendered there.
 */
export default function DevAuthTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <DevAuthTestClient />;
}
