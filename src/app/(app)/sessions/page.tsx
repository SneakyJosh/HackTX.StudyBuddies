import type { Metadata } from "next";
import { SessionsBoard } from "@/components/sessions-board";

export const metadata: Metadata = {
  title: "Sessions",
};

export default function SessionsPage() {
  return <SessionsBoard />;
}
