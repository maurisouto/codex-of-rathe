import type { Metadata } from "next";
import { TomeLeaderboard } from "@/features/tome/tome-leaderboard";

export const metadata: Metadata = { title: "Tome of Fyendal Leaderboard" };

export default function TomeLeaderboardPage() {
  return <TomeLeaderboard />;
}
