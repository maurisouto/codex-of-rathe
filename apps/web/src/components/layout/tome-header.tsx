import Image from "next/image";
import Link from "next/link";
import { SiteHeaderAuth } from "@/components/auth/site-header-auth";
import styles from "@/features/tome/tome.module.css";

const navLink = "inline-flex min-h-11 items-center rounded-sm text-sm text-[#BDCCE2] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]";

export function TomeHeader({ leaderboard = false }: { leaderboard?: boolean }) {
  const links = (
    <>
      <Link href="/" className={navLink}>
        <span aria-hidden="true" className="mr-1">←</span> Back to Codex hub
      </Link>
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
    </>
  );

  return (
    <header className="border-b border-[#7089AA]/60 bg-[#081222] text-[#F1F7FF]">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[auto_minmax(0,1fr)_auto] px-4 py-2 sm:px-6">
        <Link href="/tome" aria-current={leaderboard ? undefined : "page"} className="flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0F0FF]">
          <Image
            src="/assets/tome-of-fyendal-logo.png"
            alt="Tome of Fyendal"
            width={2106}
            height={593}
            className="h-10 w-auto max-w-[42vw] object-contain sm:h-12 sm:max-w-none"
          />
        </Link>
        <nav aria-label="Tome of Fyendal" className="hidden flex-wrap gap-x-4 md:flex">
          {links}
        </nav>
        <div className={`${styles.headerAuth} justify-self-end`}><SiteHeaderAuth /></div>
        <nav aria-label="Tome of Fyendal" className="col-span-full flex flex-wrap gap-x-4 md:hidden">
          {links}
        </nav>
      </div>
    </header>
  );
}
