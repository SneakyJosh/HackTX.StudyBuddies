"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getRequests, isApiError } from "@/lib/api-client";
import { labelForEmail, signOut } from "@/lib/session";
import { useHydratedDemo } from "@/components/demo-provider";
import { LinkButton } from "@/components/ui";

const TABS = [
  { href: "/discover", label: "Discover" },
  { href: "/check-in", label: "Check-in" },
  { href: "/requests", label: "Requests" },
  { href: "/profile", label: "Profile" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const demo = useHydratedDemo();

  if (!demo.hydrated || !demo.ready || !demo.userId) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
        <header className="border-b border-line px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Demo campus</p>
          <p className="text-lg font-semibold">StudySync</p>
        </header>
        <div className="px-4 py-5">
          {demo.hydrated && demo.ready ? (
            <main className="mx-auto grid max-w-lg gap-4">
              <h1 className="text-2xl font-semibold">Sign in required</h1>
              <p className="text-sm leading-6 text-muted">
                Discover, check-in, requests, and profile stay private until you sign in.
              </p>
              <LinkButton href="/" className="self-start">
                Sign in
              </LinkButton>
            </main>
          ) : (
            children
          )}
        </div>
      </div>
    );
  }

  return (
    <SignedInShell userId={demo.userId} email={demo.email} revision={demo.revision}>
      {children}
    </SignedInShell>
  );
}

function SignedInShell({
  userId,
  email,
  revision,
  children,
}: {
  userId: string;
  email: string | null;
  revision: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const accountLabel = labelForEmail(email) ?? email ?? "Signed in";
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getRequests("all").then((result) => {
      if (cancelled || isApiError(result)) return;
      setPendingCount(result.data.filter((request) => request.status === "pending").length);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  return (
    <div className="flex min-h-dvh w-full flex-col md:flex-row">
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:static md:w-52 md:shrink-0 md:border-t-0 md:border-r"
      >
        <ul className="grid grid-cols-4 md:flex md:flex-col md:gap-1 md:p-3">
          {TABS.map((tab) => {
            const current = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-xs font-semibold md:min-h-11 md:flex-row md:justify-between md:rounded-xl md:px-3 md:text-sm ${
                    current ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-muted"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.href === "/requests" && pendingCount !== null && pendingCount > 0 ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      <span className="sr-only">{pendingCount} pending requests</span>
                      <span aria-hidden="true">{pendingCount}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-background px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Demo campus</p>
            <p className="text-lg font-semibold leading-tight">StudySync</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{accountLabel}</p>
            <button
              type="button"
              className="text-sm font-semibold text-accent"
              onClick={() => {
                void signOut().then(() => router.push("/"));
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="flex-1 px-4 py-5">{children}</div>
      </div>
    </div>
  );
}
