import Image from "next/image";
import Link from "next/link";
import { SiteHeaderAuth } from "@/components/auth/site-header-auth";
import wayfindersArc from "@/features/chronicle/assets/wayfinders-arc-compact.svg";
import styles from "@/features/chronicle/chronicle.module.css";

export function ChronicleHeader({ leaderboard = false }: { leaderboard?: boolean }) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.siteHeaderInner}>
        <Link href="/chronicle" aria-current={leaderboard ? undefined : "page"} className={styles.brandLink}>
          <Image src={wayfindersArc} alt="Chronicle of Rathe" unoptimized />
        </Link>
        <nav aria-label="Chronicle" className={styles.siteNav}>
          <Link href="/"><span aria-hidden="true">←</span>Back to Codex hub</Link>
          {leaderboard ? (
            <Link href="/chronicle">Play Chronicle</Link>
          ) : (
            <>
              <a href="#modes" className={styles.setupLink}>Modes</a>
              <a href="#how" className={styles.setupLink}>How to play</a>
              <a href="#faq" className={styles.setupLink}>FAQ</a>
            </>
          )}
          <Link href="/chronicle/leaderboard" aria-current={leaderboard ? "page" : undefined}>Leaderboard</Link>
        </nav>
        <div className={styles.headerAuth}><SiteHeaderAuth /></div>
      </div>
    </header>
  );
}
