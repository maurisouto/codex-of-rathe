import type { Metadata } from "next";

import { ChronicleLeaderboard } from "@/features/chronicle/chronicle-leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard · Chronicle of Rathe",
  description: "Compare Chronicle of Rathe records in Streak, Timed, and Untimed.",
};

export default function ChronicleLeaderboardPage() {
  return <ChronicleLeaderboard />;
}
