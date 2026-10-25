"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getCheckin, getRequests, getSessions, isApiError } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/labels";
import { labelForEmail, signOut } from "@/lib/session";
import { BrandMark } from "@/components/brand-mark";
import { useDemo } from "@/components/demo-provider";
import { LinkButton, cx } from "@/components/ui";

const TABS = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/connect", label: "Connect", icon: ConnectIcon },
  { href: "/sessions", label: "Sessions", icon: SessionsIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const demo = useDemo();

  if (!demo.ready || !demo.userId) {
    return (
      <div className="min-h-dvh bg-page">
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 lg:px-10">
          <header className="flex items-center gap-3">
            <BrandMark size={44} />
            <p className="font-display text-2xl font-extrabold">StudyBuddie</p>
          </header>
          <div className="flex flex-1 items-center justify-center py-8">
            {demo.ready ? (
              <main className="panel-shadow grid w-full max-w-xl gap-4 rounded-[28px] border border-line bg-background p-6 sm:p-8">
                <h1 className="font-display text-3xl font-extrabold">Sign in required</h1>
                <p className="text-[15px] leading-6 text-muted">
                  Home, Connect, Sessions, Profile, and the campus map stay private until you sign in.
                </p>
                <LinkButton href="/" className="w-full sm:w-auto">
                  Sign in
                </LinkButton>
              </main>
            ) : (
              children
            )}
          </div>
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
  const [sessionAlerts, setSessionAlerts] = useState<number | null>(null);
  const [studyBanner, setStudyBanner] = useState<{ until: string; live: boolean } | null>(null);
  const currentTab = TABS.find((tab) => tab.href === pathname);

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

  useEffect(() => {
    let cancelled = false;
    void getSessions("upcoming").then((result) => {
      if (cancelled || isApiError(result)) return;
      setSessionAlerts(
        result.data.filter((session) => {
          if (session.myStatus === "invited") return true;
          return session.myRole === "host" && session.participants.some((person) => person.status === "requested");
        }).length,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  useEffect(() => {
    let cancelled = false;
    void getCheckin().then((result) => {
      if (cancelled || isApiError(result)) return;
      setStudyBanner(
        result.data ? { until: formatTimestamp(result.data.expiresAt), live: result.data.live } : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  function signOutAndLeave() {
    void signOut().then(() => router.push("/"));
  }

  return (
    <div className="min-h-dvh bg-background lg:bg-page">
      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
          <div className="flex items-center gap-3 px-5 pt-6 pb-5">
            <BrandMark size={48} />
            <div>
              <p className="font-display text-[1.65rem] leading-none font-extrabold">StudyBuddie</p>
              <p className="mt-1 text-xs font-semibold text-muted">Campus study partners</p>
            </div>
          </div>
          <nav aria-label="Primary" className="px-3">
            <ul className="grid gap-1">
              {TABS.map((tab) => (
                <li key={tab.href}>
                  <NavLink
                    href={tab.href}
                    label={tab.label}
                    icon={tab.icon}
                    current={pathname === tab.href}
                    pendingCount={tab.href === "/connect" ? pendingCount : tab.href === "/sessions" ? sessionAlerts : null}
                    layout="sidebar"
                  />
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto border-t border-line px-5 py-4">
            <p className="truncate text-sm font-bold">{accountLabel}</p>
            <button type="button" className="mt-1 text-sm font-bold text-accent" onClick={signOutAndLeave}>
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-background/95 px-4 py-3 backdrop-blur-sm lg:px-8">
            <div className="min-w-0">
              <p className="font-display text-xl leading-none font-extrabold lg:hidden">StudyBuddie</p>
              <p className="font-display hidden text-2xl leading-none font-extrabold lg:block">
                {currentTab?.label ?? "StudyBuddie"}
              </p>
              <p className="mt-1 hidden text-sm text-muted lg:block">Public buildings only. No precise location.</p>
            </div>
            <div className="text-right lg:hidden">
              <p className="max-w-40 truncate text-sm font-bold sm:max-w-xs">{accountLabel}</p>
              <button type="button" className="text-sm font-bold text-accent" onClick={signOutAndLeave}>
                Sign out
              </button>
            </div>
          </header>
          {studyBanner ? (
            <Link
              href="/sessions"
              className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background lg:mx-8"
            >
              <span>{studyBanner.live ? "Studying" : "Planned time ended"}</span>
              <span>{studyBanner.live ? `until ${studyBanner.until}` : "Finish to save minutes"}</span>
            </Link>
          ) : null}
          <div className="flex-1 px-[18px] pt-5 pb-28 lg:px-8 lg:pt-8 lg:pb-10">
            <div className="mx-auto w-full max-w-[1180px] xl:max-w-none">{children}</div>
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <NavLink
                href={tab.href}
                label={tab.label}
                icon={tab.icon}
                current={pathname === tab.href}
                pendingCount={tab.href === "/connect" ? pendingCount : tab.href === "/sessions" ? sessionAlerts : null}
                layout="tabs"
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  current,
  pendingCount,
  layout,
}: {
  href: (typeof TABS)[number]["href"];
  label: string;
  icon: () => ReactNode;
  current: boolean;
  pendingCount: number | null;
  layout: "tabs" | "sidebar";
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "font-semibold text-muted hover:bg-surface-muted",
        current && "nav-current text-accent",
        layout === "tabs"
          ? "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[12px]"
          : "flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm",
        layout === "sidebar" && current && "bg-accent-soft hover:bg-accent-soft",
      )}
    >
      <span className="relative">
        <Icon />
        {pendingCount !== null && pendingCount > 0 ? (
          <span className="absolute -top-1.5 -right-2 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-extrabold text-white">
            <span className="sr-only">{pendingCount} pending requests</span>
            <span aria-hidden="true">{pendingCount}</span>
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 11.2 12 5l7.5 6.2V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.2H10.2v5.2H6A1.5 1.5 0 0 1 4.5 19v-7.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ConnectIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 19c.7-2.6 2.6-4 4.6-4s3.8 1.4 4.5 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M14.2 15.2c.6-.3 1.3-.4 2-.4 1.7 0 3.1 1 3.6 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SessionsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.8v2.4M16 3.8v2.4M4 9.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6 19c.8-2.8 2.8-4.2 6-4.2s5.2 1.4 6 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
