"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { missingPublicSupabaseEnv } from "@/lib/browser-supabase";
import { signInWithPassword } from "@/lib/session";
import { DEMO_UNIVERSITY } from "@/types/api";
import { useHydratedDemo } from "@/components/demo-provider";
import { BrandMark, Button, ErrorBlock, LinkButton, cx, fieldClass, inputClass } from "@/components/ui";

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
  const [view, setView] = useState<"welcome" | "sign-in">("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const missingEnv = missingPublicSupabaseEnv();

  if (!demo.hydrated || !demo.ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-page px-5">
        <p role="status" className="font-display text-2xl font-extrabold">
          Loading StudySync
        </p>
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
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)] lg:bg-page">
      <section className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex xl:px-16">
        <p className="font-display text-3xl font-extrabold">StudySync</p>
        <div className="max-w-xl">
          <BrandMark size={120} />
          <h1 className="mt-8 font-display text-5xl leading-[1.05] font-extrabold">
            Find a study partner at a public campus building.
          </h1>
          <p className="mt-4 max-w-md text-lg leading-7 text-muted">
            Check in, see who opted in on {DEMO_UNIVERSITY.name}, and send a study request.
          </p>
        </div>
        <ul className="grid max-w-xl grid-cols-3 gap-3">
          {[
            ["Discover", "See students who are checked in."],
            ["Check-in", "Share a building, not a precise spot."],
            ["Requests", "Accept a partner when you both agree."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-[20px] border border-line bg-surface px-4 py-4">
              <p className="font-display text-lg font-bold">{title}</p>
              <p className="mt-1 text-sm leading-5 text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-h-dvh flex-col bg-background px-5 py-8 sm:px-10 lg:justify-center lg:px-14 xl:px-20">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col lg:flex-none">
          {view === "welcome" ? (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center text-center lg:items-start lg:text-left">
                <BrandMark size={104} />
                <h1 className="mt-6 font-display text-[2.6rem] leading-none font-extrabold">StudySync</h1>
                <p className="mt-4 max-w-sm text-[15px] leading-6 text-muted">
                  Keep your study plans on campus, find a partner, and pick a public building.
                </p>
              </div>
              <div className="mt-8 grid gap-3 pb-4">
                <Button className="h-12 w-full text-base" onClick={() => setView("sign-in")}>
                  Sign in
                </Button>
                <p className="text-center text-sm leading-6 text-muted lg:text-left">
                  Use the email and password for your StudySync account.
                </p>
                {demo.userId ? (
                  <div className="rounded-[20px] border border-line bg-surface px-4 py-4 text-left">
                    <p className="text-sm text-muted">Signed in as {demo.email ?? "your account"}.</p>
                    <LinkButton href="/discover" variant="secondary" className="mt-3 w-full">
                      Continue to Discover
                    </LinkButton>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center">
              <button
                type="button"
                className="mb-5 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-lg font-bold"
                onClick={() => {
                  setView("welcome");
                  setError(null);
                }}
              >
                <span aria-hidden="true">‹</span>
                <span className="sr-only">Back</span>
              </button>
              <h1 className="font-display text-[2rem] leading-none font-extrabold">Welcome back</h1>
              <p className="mt-2 text-[15px] text-muted">Sign in to see who is studying.</p>
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
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <div className={fieldClass}>
                    <label htmlFor="sign-in-password">Password</label>
                    <div className="relative">
                      <input
                        id="sign-in-password"
                        className={cx(inputClass, "pr-20")}
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute top-1/2 right-1.5 min-h-9 -translate-y-1/2 rounded-[12px] bg-surface-muted px-3 text-sm font-bold"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm leading-5 text-muted">
                    The password is sent to sign-in and is not saved in the app.
                  </p>
                  {error ? (
                    <p role="alert" className="text-sm font-semibold text-danger">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={submitting} className="h-12 w-full text-base">
                    {submitting ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              )}
              {demo.userId ? (
                <div className="mt-6">
                  <p className="mb-3 text-sm text-muted">Signed in as {demo.email ?? "your account"}.</p>
                  <LinkButton href="/discover" variant="secondary" className="w-full">
                    Continue to Discover
                  </LinkButton>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
