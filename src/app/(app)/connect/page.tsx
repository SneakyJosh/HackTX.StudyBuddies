import type { Metadata } from "next";
import { ConnectBoard } from "@/components/connect-board";

export const metadata: Metadata = {
  title: "Connect",
};

export default function ConnectPage() {
  return <ConnectBoard />;
}
