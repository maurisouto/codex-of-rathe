import type { Metadata } from "next";

import { ChroniclePlay } from "@/features/chronicle/chronicle-play";

export const metadata: Metadata = {
  title: "Chronicle of Rathe",
  description: "Put Flesh and Blood card illustrations in release order.",
};

export default function ChroniclePage() {
  return <ChroniclePlay />;
}
