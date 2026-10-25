"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { missingPublicSupabaseEnv } from "@/lib/browser-supabase";
import { signUpProblem } from "@/lib/account-form";
import { signInWithPassword, signUpWithPassword } from "@/lib/session";
import { DEMO_UNIVERSITY } from "@/types/api";
import { BrandMark } from "@/components/brand-mark";
import { useDemo } from "@/components/demo-provider";
import { Button, ErrorBlock, LinkButton, cx, fieldClass, inputClass } from "@/components/ui";

function signInProblem(email: string, password: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return "Enter the email for your account.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address.";
  if (password.length === 0) return "Enter your password.";
  return null;
}

export function SignInPanel() {
  const demo = useDemo();
  const router = useRouter();
  const [view, setView] = useState<"welcome" | "sign-in" | "sign-up" | "check-email">("welcome");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const missingEnv = missingPublicSupabaseEnv();

  if (!demo.ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-page px-[max(1.25rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)]">
        <p role="status" className="font-display text-2xl font-extrabold">
          Loading StudyBuddie
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
    router.push("/home");
  }

  async function register() {
    if (missingEnv.length > 0) return;
    const problem = signUpProblem({ displayName, email, password, confirmPassword });
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await signUpWithPassword({ displayName, email, password });
    setPassword("");
    setConfirmPassword("");
    setSubmitting(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    if (result.status === "confirm-email") {
      setView("check-email");
      return;
    }
    router.push("/profile?setup=1");
  }

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)] lg:bg-page">
      <section className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex xl:px-16">
        <p className="font-display text-3xl font-extrabold">StudyBuddie</p>
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
            ["Home", "Your courses and the check-in that is active now."],
            ["Connect", "See students who opted in at a public building."],
            ["Sessions", "Start a check-in, including Focus mode."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-[20px] border border-line bg-surface px-4 py-4">
              <p className="font-display text-lg font-bold">{title}</p>
              <p className="mt-1 text-sm leading-5 text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-h-dvh flex-col overflow-x-clip bg-background px-[max(1.25rem,env(safe-area-inset-left))] pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-10 lg:justify-center lg:px-14 lg:py-8 xl:px-20">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col lg:flex-none">
          {view === "welcome" ? (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center text-center lg:items-start lg:text-left">
                <BrandMark size={104} />
                <h1 className="mt-6 font-display text-[2.6rem] leading-none font-extrabold">StudyBuddie</h1>
                <p className="mt-4 max-w-sm text-[15px] leading-6 text-muted">
                  Keep your study plans on campus, find a partner, and pick a public building.
                </p>
              </div>
              <div className="mt-8 grid gap-3 pb-4">
                <Button className="h-12 w-full text-base" onClick={() => setView("sign-in")}>
                  Sign in
                </Button>
                <Button
                  variant="secondary"
                  className="h-12 w-full text-base"
                  onClick={() => {
                    setError(null);
                    setView("sign-up");
                  }}
                >
                  Sign up
                </Button>
                <p className="text-center text-sm leading-6 text-muted lg:text-left">
                  Create an account, or sign in with the email and password you already use.
                </p>
                {demo.userId ? (
                  <div className="rounded-[20px] border border-line bg-surface px-4 py-4 text-left">
                    <p className="text-sm text-muted">Signed in as {demo.email ?? "your account"}.</p>
                    <LinkButton href="/home" variant="secondary" className="mt-3 w-full">
                      Continue to Home
                    </LinkButton>
                  </div>
                ) : null}
              </div>
            </div>
          ) : view === "check-email" ? (
            <div className="flex flex-1 flex-col justify-center">
              <h1 className="font-display text-[2rem] leading-none font-extrabold">Check your email</h1>
              <p className="mt-4 text-[15px] leading-6 text-muted">
                StudyBuddie sent a confirmation link to {email.trim() || "your email"}. Open it to finish creating
                the account, then sign in and set up your profile.
              </p>
              <Button
                className="mt-8 h-12 w-full text-base"
                onClick={() => {
                  setError(null);
                  setView("sign-in");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : view === "sign-up" ? (
            <div className="flex flex-1 flex-col justify-center">
              <button
                type="button"
                className="mb-5 grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-lg font-bold"
                onClick={() => {
                  setView("welcome");
                  setError(null);
                }}
              >
                <span aria-hidden="true">‹</span>
                <span className="sr-only">Back</span>
              </button>
              <h1 className="font-display text-[2rem] leading-none font-extrabold">Create your account</h1>
              <p className="mt-2 text-[15px] text-muted">Use your email. You will set up your study profile next.</p>
              {missingEnv.length > 0 ? (
                <div className="mt-6">
                  <ErrorBlock
                    title="Sign-up is not configured"
                    message="This app needs its public Supabase URL and publishable key in the local environment."
                  />
                </div>
              ) : (
                <form
                  className="mt-6 grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void register();
                  }}
                >
                  <label className={fieldClass} htmlFor="sign-up-name">
                    Full name
                    <input
                      id="sign-up-name"
                      className={inputClass}
                      autoComplete="name"
                      maxLength={40}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </label>
                  <label className={fieldClass} htmlFor="sign-up-email">
                    Email
                    <input
                      id="sign-up-email"
                      className={inputClass}
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <label className={fieldClass} htmlFor="sign-up-password">
                    Password
                    <input
                      id="sign-up-password"
                      className={inputClass}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  <label className={fieldClass} htmlFor="sign-up-confirm">
                    Confirm password
                    <input
                      id="sign-up-confirm"
                      className={inputClass}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="min-h-11 justify-self-start text-sm font-bold text-accent"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide passwords" : "Show passwords"}
                  </button>
                  <p className="text-sm leading-5 text-muted">
                    Use at least 8 characters, with a letter and a number. The password is sent to sign-up and is not
                    saved in the app.
                  </p>
                  {error ? (
                    <p role="alert" className="text-sm font-semibold text-danger">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={submitting} className="h-12 w-full text-base">
                    {submitting ? "Creating account…" : "Create account"}
                  </Button>
                </form>
              )}
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
                  <LinkButton href="/home" variant="secondary" className="w-full">
                    Continue to Home
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
