"use client";

import { DiscoveryFeed } from "@/components/discovery-feed";
import { RequestList } from "@/components/request-list";
import { PageHeader } from "@/components/ui";

export function ConnectBoard() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Connect"
        description="Students who opted in and checked in as available or questions only. Focused check-ins stay hidden. Scores and order come from the server."
      />
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <DiscoveryFeed embedded />
        <RequestList embedded />
      </div>
    </div>
  );
}
