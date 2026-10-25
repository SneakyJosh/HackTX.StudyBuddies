"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getBrowserSupabase } from "@/lib/browser-supabase";
import { getSessionSnapshot, noteAuthenticatedUser, subscribeSession } from "@/lib/session";

type DemoState = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  revision: number;
};

/**
 * The same object on the server and the browser's first render.
 * Session details arrive in an effect, after hydration, so the markup matches.
 */
const initialState: DemoState = {
  ready: false,
  userId: null,
  email: null,
  revision: 0,
};

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);

  useEffect(() => {
    const publish = () => {
      setState({ ready: true, ...getSessionSnapshot() });
    };
    const unsubscribe = subscribeSession(publish);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      publish();
      return unsubscribe;
    }

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
