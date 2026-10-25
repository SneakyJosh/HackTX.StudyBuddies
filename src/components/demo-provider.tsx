"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getSessionUserId, subscribeFixtureStore } from "@/fixtures/store";

type DemoState = {
  ready: boolean;
  userId: string | null;
  revision: number;
};

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>({ ready: false, userId: null, revision: 0 });

  useEffect(() => {
    const sync = () => {
      setState((current) => ({
        ready: true,
        userId: getSessionUserId(),
        revision: current.ready ? current.revision + 1 : 0,
      }));
    };
    sync();
    return subscribeFixtureStore(sync);
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
