import type { Metadata } from "next";
import { CheckinPanel } from "@/components/checkin-panel";

export const metadata: Metadata = {
  title: "Check-in",
};

export default function CheckinPage() {
  return <CheckinPanel />;
}
