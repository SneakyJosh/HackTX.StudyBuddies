import type { Metadata } from "next";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: { absolute: "Sign in · StudyBuddie" },
};

export default function HomePage() {
  return <SignInPanel />;
}
