import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellScreens = [
  "src/components/app-shell.tsx",
  "src/components/sign-in-panel.tsx",
  "src/components/discovery-feed.tsx",
  "src/components/checkin-panel.tsx",
  "src/components/request-list.tsx",
  "src/components/profile-form.tsx",
  "src/components/home-dashboard.tsx",
  "src/components/connect-board.tsx",
  "src/components/sessions-board.tsx",
  "src/components/focus-sheet.tsx",
  "src/components/schedule-sheet.tsx",
  "src/components/open-sessions.tsx",
  "src/components/study-stats-card.tsx",
  "src/components/session-history.tsx",
  "src/components/campus-map.tsx",
];

test("BrandMark is exported from its own module and imported by name", () => {
  const brand = readFileSync("src/components/brand-mark.tsx", "utf8");
  assert.match(brand, /export function BrandMark\(/);
  assert.match(brand, /role="img"/);
  for (const file of ["src/components/app-shell.tsx", "src/components/sign-in-panel.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /import \{ BrandMark \} from "@\/components\/brand-mark"/, file);
    assert.doesNotMatch(source, /import \{[^}]*\bBrandMark\b[^}]*\} from "@\/components\/ui"/, file);
    assert.match(source, /<BrandMark\b/, file);
  }
});

test("the first auth render does not depend on a browser-only flag", () => {
  const provider = readFileSync("src/components/demo-provider.tsx", "utf8");
  assert.match(provider, /ready: false/);
  assert.match(provider, /userId: null/);
  assert.equal(provider.includes("useSyncExternalStore"), false);
  assert.equal(provider.includes("missingPublicSupabaseEnv"), false);
  for (const file of shellScreens) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("useHydratedDemo"), false, file);
    assert.equal(source.includes("demo.hydrated"), false, file);
  }
});
