import type { Metadata } from "next";
import { CampusMapBoard } from "@/components/campus-map";

export const metadata: Metadata = {
  title: "Campus map",
};

export default function CampusMapPage() {
  return <CampusMapBoard />;
}
