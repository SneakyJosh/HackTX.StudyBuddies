import { Suspense } from "react";
import type { Metadata } from "next";
import { SessionsBoard } from "@/components/sessions-board";
import { LoadingBlock } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sessions",
};

export default function SessionsPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading sessions" />}>
      <SessionsBoard />
    </Suspense>
  );
}
