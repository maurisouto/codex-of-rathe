import type { Metadata } from "next";

import { TomePlay } from "@/features/tome/tome-play";

export const metadata: Metadata = {
  title: "Tome of Fyendal",
  description: "Eight questions on Flesh and Blood card art, from the artist’s credit to the artwork’s first release.",
};

export default function TomePage() {
  return <TomePlay />;
}
