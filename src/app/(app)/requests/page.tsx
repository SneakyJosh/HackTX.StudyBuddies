import type { Metadata } from "next";
import { RequestList } from "@/components/request-list";

export const metadata: Metadata = {
  title: "Requests",
};

export default function RequestsPage() {
  return <RequestList />;
}
