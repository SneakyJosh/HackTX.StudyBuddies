"use client";

import { useRouter } from "next/navigation";
import { FIXTURE_DEMO_LOGINS } from "@/fixtures/population";
import { signInDemo } from "@/fixtures/store";
import { DEMO_UNIVERSITY } from "@/types/api";
import { useHydratedDemo } from "@/components/demo-provider";
import { LinkButton } from "@/components/ui";

export function SignInPanel() {
  const demo = useHydratedDemo();
  const router = useRouter();

  if (!demo.hydrated) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-4">
        <p role="status">Loading StudySync</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">StudySync demo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose a demo account</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        These are labeled fictional accounts for {DEMO_UNIVERSITY.name}. This screen is not a real
        login and does not ask for a password.
      </p>
      <div className="mt-5 rounded-2xl border border-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
        Demo mode only. Demo Student A and Demo Student B are not real students. No password is
        collected.
      </div>
      <div className="mt-6 grid gap-3">
        {FIXTURE_DEMO_LOGINS.map((account) => {
          const selected = demo.userId === account.userId;
          return (
            <button
              key={account.userId}
              type="button"
              onClick={() => {
                signInDemo(account.userId);
                router.push("/discover");
              }}
              className="rounded-2xl border border-line bg-surface px-4 py-4 text-left shadow-sm transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <span className="block text-xs font-semibold uppercase tracking-wide text-accent">
                Demo account{selected ? " · currently signed in" : ""}
              </span>
              <span className="mt-1 block text-lg font-semibold">Continue as {account.label}</span>
              <span className="mt-1 block text-sm text-muted">{account.email}</span>
            </button>
          );
        })}
      </div>
      {demo.userId ? (
        <div className="mt-6">
          <LinkButton href="/discover" variant="secondary">
            Continue to Discover
          </LinkButton>
        </div>
      ) : null}
    </main>
  );
}
