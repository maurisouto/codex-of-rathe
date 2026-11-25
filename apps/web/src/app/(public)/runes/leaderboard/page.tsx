import type { Metadata } from "next";
import { RunesLeaderboard } from "@/features/runes/runes-records";

export const metadata: Metadata = { title: "Read the Runes Leaderboard" };
export default function RunesLeaderboardPage() { return <RunesLeaderboard />; }
