"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { missingPublicSupabaseEnv } from "@/lib/browser-supabase";
import { labelForEmail, signInWithPassword } from "@/lib/session";
import { DEMO_ACCOUNTS, DEMO_UNIVERSITY } from "@/types/api";
import { useHydratedDemo } from "@/components/demo-provider";
import { ErrorBlock, LinkButton, Button, inputClass } from "@/components/ui";

export function SignInPanel() {
  const demo = useHydratedDemo();
  const router = useRouter();
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS[0].email);
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
    if (password.length === 0) {
      setError("Enter the password for this demo account.");
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

  const signedInLabel = labelForEmail(demo.email) ?? demo.email;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">StudySync demo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        These are labeled fictional accounts for {DEMO_UNIVERSITY.name}. Sign in with the password
        stored for this demo project.
      </p>
      <div className="mt-5 rounded-2xl border border-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
        Demo mode only. Demo Student A and Demo Student B are not real students. The password is
        sent to sign-in and is not saved in the app.
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
          className="mt-6 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">
            {DEMO_ACCOUNTS.map((account) => {
              const selected = email === account.email;
              const current = demo.email === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setEmail(account.email)}
                  className="rounded-2xl border border-line bg-surface px-4 py-4 text-left shadow-sm transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  aria-pressed={selected}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wide text-accent">
                    Demo account
                    {selected ? " · selected" : ""}
                    {current ? " · currently signed in" : ""}
                  </span>
                  <span className="mt-1 block text-lg font-semibold">Continue as {account.label}</span>
                  <span className="mt-1 block text-sm text-muted">{account.email}</span>
                </button>
              );
            })}
          </div>
          <label className="grid gap-2 text-sm font-medium" htmlFor="demo-password">
            Password
            <input
              id="demo-password"
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
          <p className="mb-3 text-sm text-muted">Signed in as {signedInLabel ?? "your account"}.</p>
          <LinkButton href="/discover" variant="secondary">
            Continue to Discover
          </LinkButton>
        </div>
      ) : null}
    </main>
  );
}
