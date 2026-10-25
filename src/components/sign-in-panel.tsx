"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { missingPublicSupabaseEnv } from "@/lib/browser-supabase";
import { signInWithPassword } from "@/lib/session";
import { DEMO_UNIVERSITY } from "@/types/api";
import { useHydratedDemo } from "@/components/demo-provider";
import { Button, ErrorBlock, LinkButton, fieldClass, inputClass } from "@/components/ui";

function signInProblem(email: string, password: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return "Enter the email for your account.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address.";
  if (password.length === 0) return "Enter your password.";
  return null;
}

export function SignInPanel() {
  const demo = useHydratedDemo();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const missingEnv = missingPublicSupabaseEnv();

  if (!demo.hydrated || !demo.ready) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-4">
        <p role="status">Loading StudySync</p>
      </main>
    );
  }

  async function submit() {
    if (missingEnv.length > 0) return;
    const problem = signInProblem(email, password);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    const message = await signInWithPassword(email, password);
    setPassword("");
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    router.push("/discover");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">StudySync demo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Use the email and password for your {DEMO_UNIVERSITY.name} StudySync account.
      </p>
      <div className="mt-5 rounded-2xl border border-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
        Demo project only. Do not use a real student record. The password is sent to sign-in and is
        not saved in the app.
      </div>
      {missingEnv.length > 0 ? (
        <div className="mt-6">
          <ErrorBlock
            title="Sign-in is not configured"
            message="This app needs its public Supabase URL and publishable key in the local environment."
          />
        </div>
      ) : (
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={fieldClass} htmlFor="sign-in-email">
            Email
            <input
              id="sign-in-email"
              className={inputClass}
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={fieldClass} htmlFor="sign-in-password">
            Password
            <input
              id="sign-in-password"
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}
      {demo.userId ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-muted">Signed in as {demo.email ?? "your account"}.</p>
          <LinkButton href="/discover" variant="secondary">
            Continue to Discover
          </LinkButton>
        </div>
      ) : null}
    </main>
  );
}
