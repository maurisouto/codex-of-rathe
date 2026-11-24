import Image from "next/image";
import Link from "next/link";
import styles from "@/features/tome/tome.module.css";
import { SiteHeaderAuth } from "@/components/auth/site-header-auth";

const navLink = "inline-flex min-h-11 items-center rounded-sm text-sm text-[#BDCCE2] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]";

export function TomeHeader({ leaderboard = false }: { leaderboard?: boolean }) {
  return (
    <header className="border-b border-[#7089AA]/60 bg-[#081222] text-[#F1F7FF]">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[auto_auto_1fr] px-4 py-2 sm:px-6">
        <Link href="/tome" aria-current={leaderboard ? undefined : "page"} className="flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]">
          <Image
            src="/assets/tome-of-fyendal-logo.png"
            alt="Tome of Fyendal"
            width={2106}
            height={593}
            className="h-10 w-auto max-w-[42vw] object-contain sm:h-12 sm:max-w-none"
          />
        </Link>
        <div className={styles.headerAuth}><SiteHeaderAuth /></div>
        <nav aria-label="Tome of Fyendal" className="col-span-full flex flex-wrap gap-x-4 md:col-span-1 md:justify-end">
          {leaderboard ? (
            <Link href="/tome" className={navLink}>Play Tome</Link>
          ) : (
            <>
              <a href="#how" className={`${navLink} ${styles.setupLink}`}>How to play</a>
              <a href="#faq" className={`${navLink} ${styles.setupLink}`}>FAQ</a>
            </>
          )}
          <Link href="/tome/leaderboard" aria-current={leaderboard ? "page" : undefined} className={navLink}>
            Leaderboard
          </Link>
          <Link href="/" className={navLink}>
            <span aria-hidden="true" className="mr-1">←</span> Back to Codex hub
          </Link>
        </nav>
      </div>
    </header>
  );
}
