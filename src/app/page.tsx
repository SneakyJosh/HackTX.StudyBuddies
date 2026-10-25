import type { Metadata } from "next";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function HomePage() {
  return <SignInPanel />;
}
