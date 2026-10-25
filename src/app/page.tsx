import type { Metadata } from "next";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: "Demo sign-in",
};

export default function HomePage() {
  return <SignInPanel />;
}
