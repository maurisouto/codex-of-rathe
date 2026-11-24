import type { Metadata } from "next";
import { siteConfig } from "@/lib/config/site";
import { GuessTheCardLanding } from "@/components/home/guess-the-card-landing";

const description =
  "Reveal clues step by step and name the Flesh and Blood card — solo, challenge, co-op, or competitive. Onboarding and modes for Guess the Card.";

export const metadata: Metadata = {
  title: "Guess the Card",
  description,
  openGraph: {
    title: `Guess the Card · ${siteConfig.shortName}`,
    description,
    type: "website",
  },
};

export default function GuessTheCardPage() {
  return <GuessTheCardLanding />;
}
