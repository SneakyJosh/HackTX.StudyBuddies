"use client";

import { DiscoveryFeed } from "@/components/discovery-feed";
import { FriendsStudying } from "@/components/friends-studying";
import { OpenSessions } from "@/components/open-sessions";
import { RequestList } from "@/components/request-list";
import { PageHeader } from "@/components/ui";

export function ConnectBoard() {
  return (
    <div className="grid w-full gap-8">
      <PageHeader
        title="Connect"
        description="Friends who are studying now, then suggested buddies ranked by the current server score."
      />
      <FriendsStudying />
      <DiscoveryFeed embedded />
      <RequestList embedded />
      <OpenSessions />
    </div>
  );
}
