import type { Metadata } from "next";
import { DiscoveryFeed } from "@/components/discovery-feed";

export const metadata: Metadata = {
  title: "Discover",
};

export default function DiscoverPage() {
  return <DiscoveryFeed />;
}
