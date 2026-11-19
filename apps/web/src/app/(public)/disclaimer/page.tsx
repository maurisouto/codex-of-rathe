import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";

const title = "Disclaimer | Codex of Rathe";
const description =
  "Read the fan project disclaimer and Flesh and Blood attribution for Codex of Rathe and its minigames.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, type: "website" },
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
      <Link
        href="/"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-[#B8D6FF] underline-offset-4 hover:underline"
      >
        <span aria-hidden="true">←</span> Back to Codex hub
      </Link>
      <Panel
        variant="subtle"
        className="border-[#60A5FA]/30 bg-[radial-gradient(ellipse_at_top_right,#24436A66,transparent_58%),linear-gradient(160deg,#121826,#0B0D12)] p-5 shadow-[0_0_24px_rgba(59,130,246,0.10)] sm:p-7"
      >
        <h1 className="font-codex text-2xl font-semibold text-[var(--gold-bright)] sm:text-3xl">
          Codex of Rathe disclaimer
        </h1>

        <div className="mt-5 space-y-4 text-sm leading-relaxed text-[#C8D7F2] sm:text-[0.95rem]">
          <p>
            Codex of Rathe is an independent fan project for the Flesh and Blood community.
            This disclaimer covers the Codex hub and all its minigames, including Guess the Card,
            Fragments of Rathe, and Chronicle of Rathe.
          </p>
          <p>
            Codex of Rathe and its minigames are not affiliated with, endorsed by, sponsored by,
            or officially connected to Legend Story Studios® or Flesh and Blood™.
          </p>

          <h2 className="font-codex pt-2 text-lg text-[#D8E7FF]">Card artwork and attribution</h2>
          <p>
            Flesh and Blood™ names, marks, hero and set names, card artwork, and related intellectual
            property belong to their respective owners. Card images and related assets appear for
            gameplay, reference, and educational purposes. Codex of Rathe claims no ownership of
            official game assets, trademarks, or artwork.
          </p>

          <h2 className="font-codex pt-2 text-lg text-[#D8E7FF]">Contact</h2>
          <p>
            If you are a rights holder and want to request an attribution correction or the removal
            of content, contact us through the{" "}
            <a
              href="https://github.com/maurisouto/codex-of-rathe"
              className="text-[#B8D6FF] underline underline-offset-4 hover:text-white"
            >
              Codex of Rathe repository
            </a>.
          </p>
        </div>
      </Panel>
    </div>
  );
}
