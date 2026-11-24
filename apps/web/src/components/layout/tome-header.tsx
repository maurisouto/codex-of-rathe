import Image from "next/image";
import Link from "next/link";
import { SiteHeaderAuth } from "@/components/auth/site-header-auth";

export function TomeHeader({ leaderboard = false }: { leaderboard?: boolean }) {
  return (
    <header className="border-b border-[#7089AA]/60 bg-[#081222] text-[#F1F7FF]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/tome" aria-current={leaderboard ? undefined : "page"} className="flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]">
          <Image
            src="/assets/tome-of-fyendal-logo.png"
            alt="Tome of Fyendal"
            width={2106}
            height={593}
            className="h-10 w-auto max-w-[42vw] object-contain sm:h-12 sm:max-w-none"
          />
        </Link>
        <nav aria-label="Tome of Fyendal" className="flex flex-wrap gap-x-4">
          <Link href="/tome/leaderboard" aria-current={leaderboard ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-sm text-sm text-[#BDCCE2] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]">
            Leaderboard
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-sm text-sm text-[#BDCCE2] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]">
            <span aria-hidden="true" className="mr-1">←</span> Back to Codex hub
          </Link>
        </nav>
        <SiteHeaderAuth />
      </div>
    </header>
  );
}
