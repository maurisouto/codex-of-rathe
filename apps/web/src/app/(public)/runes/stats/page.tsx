import type { Metadata } from "next";
import { RunesStats } from "@/features/runes/runes-records";

export const metadata: Metadata = { title: "Your Read the Runes Archive" };
export default function RunesStatsPage() { return <RunesStats />; }
