import type { Metadata } from "next";

import { TomePlay } from "@/features/tome/tome-play";

export const metadata: Metadata = {
  title: "Tome of Fyendal",
  description: "Test your Flesh and Blood knowledge. Study the artwork and answer eight questions about the cards of Rathe.",
};

export default function TomePage() {
  return <TomePlay />;
}
