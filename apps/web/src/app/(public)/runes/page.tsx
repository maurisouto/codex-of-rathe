import type { Metadata } from "next";
import { RunesPlay } from "@/features/runes/runes-play";

export const metadata: Metadata = {
  title: "Read the Runes",
  description: "Read verified clues and identify the card artwork.",
};

export default function RunesPage() {
  return <RunesPlay />;
}
