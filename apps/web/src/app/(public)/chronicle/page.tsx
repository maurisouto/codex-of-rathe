import type { Metadata } from "next";

import { ChroniclePlay } from "@/features/chronicle/chronicle-play";

export const metadata: Metadata = {
  title: "Chronicle of Rathe",
  description: "Trace the history of Rathe through Flesh and Blood illustrations. Order their first commercial releases from earliest to latest.",
};

export default function ChroniclePage() {
  return <ChroniclePlay />;
}
