import Link from "next/link";
import Image from "next/image";
import { SiteHeaderAuth } from "@/components/auth/site-header-auth";
import styles from "@/features/runes/runes.module.css";

export function RunesHeader({ leaderboard = false, stats = false }: { leaderboard?: boolean; stats?: boolean }) {
  const links = (
    <>
      <Link href="/">← Back to Codex hub</Link>
      {leaderboard || stats ? <Link href="/runes">Play Read the Runes</Link> : <a href="#how" className={styles.setupLink}>How to play</a>}
      {!leaderboard && !stats && <a href="#faq" className={styles.setupLink}>FAQ</a>}
      <Link href="/runes/leaderboard" aria-current={leaderboard ? "page" : undefined}>Leaderboard</Link>
      <Link href="/runes/stats" aria-current={stats ? "page" : undefined}>Your archive</Link>
    </>
  );

  return (
    <header className={styles.siteHeader}>
      <div className={styles.siteHeaderInner}>
        <Link href="/runes" className={styles.brandLink}>
          <Image src="/runes/brand/read-the-runes-horizontal.svg" alt="Read the Runes" width={294} height={56} className={styles.brandLogo} priority />
        </Link>
        <nav className={styles.siteNav} aria-label="Read the Runes">{links}</nav>
        <div className={styles.headerAuth}><SiteHeaderAuth /></div>
      </div>
    </header>
  );
}
