"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getBrowserSupabase, missingPublicSupabaseEnv } from "@/lib/browser-supabase";
import { getSessionSnapshot, noteAuthenticatedUser, subscribeSession } from "@/lib/session";

type DemoState = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  revision: number;
};

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>({
    ready: missingPublicSupabaseEnv().length > 0,
    userId: null,
    email: null,
    revision: 0,
  });

  useEffect(() => {
    const publish = () => {
      setState({ ready: true, ...getSessionSnapshot() });
    };
    const unsubscribe = subscribeSession(publish);
    const supabase = getBrowserSupabase();
    if (!supabase) return unsubscribe;

    let active = true;
    const revisionAtStart = getSessionSnapshot().revision;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || getSessionSnapshot().revision !== revisionAtStart) return;
      noteAuthenticatedUser(data.user?.id ?? null, data.user?.email ?? null);
      publish();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      noteAuthenticatedUser(session?.user.id ?? null, session?.user.email ?? null);
      publish();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      unsubscribe();
    };
  }, []);

  return <DemoContext.Provider value={state}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const value = useContext(DemoContext);
  if (!value) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return value;
}

function subscribeToHydration(): () => void {
  return () => {};
}

/** False during server render and hydration, then true in the browser. */
export function useHydratedDemo(): DemoState & { hydrated: boolean } {
  const demo = useDemo();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  return { ...demo, hydrated };
}
