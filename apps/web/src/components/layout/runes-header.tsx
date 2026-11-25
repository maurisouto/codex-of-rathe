import Link from "next/link";
import { SiteHeaderAuth } from "@/components/auth/site-header-auth";
import styles from "@/features/runes/runes.module.css";

function RuneMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" className={styles.mark}>
      <path d="M6 4 12 10 8 17 16 17 18 25 23 18 30 20 27 12 32 6 23 8 18 2 15 10Z" />
      <path d="m10 24 6-2m4 7 2-6m6-1 4 4M7 31l4-5" />
    </svg>
  );
}

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
        <Link href="/runes" className={styles.brandLink} aria-label="Read the Runes">
          <RuneMark /><span>Read the Runes</span>
        </Link>
        <nav className={styles.siteNav} aria-label="Read the Runes">{links}</nav>
        <div className={styles.headerAuth}><SiteHeaderAuth /></div>
      </div>
    </header>
  );
}
