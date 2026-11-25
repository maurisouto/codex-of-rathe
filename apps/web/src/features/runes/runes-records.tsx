"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { fetchRunesBoard, fetchRunesStats } from "./runes-client";
import styles from "./runes.module.css";

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RunesLeaderboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRunesBoard>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetchRunesBoard(controller.signal).then(setData).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The leaderboard could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id]);
  return <main className={styles.experience}><div className={styles.content}><section className={`${styles.panel} ${styles.help}`}>
    <p className={styles.eyebrow}>Read the Runes</p><h1 className={styles.title}>Leaderboard</h1>
    {authLoading ? <p role="status">Loading account…</p> : !user ? <p>Guest rounds are never ranked. Sign in to record completed wins.</p> : data?.personalBest && <p>Your best: rank {data.personalBest.rank} · {data.personalBest.clues} clues · {formatTime(data.personalBest.elapsedMs)}</p>}
    {loading && <p role="status">Loading standings…</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && !error && data?.entries.length === 0 && <p>No ranked wins yet. Be the first to identify an artwork.</p>}
    {!loading && !error && Boolean(data?.entries.length) && <table className={styles.table}><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Clues</th><th scope="col">Time</th></tr></thead><tbody>{data?.entries.map((entry) => <tr key={`${entry.userId}-${entry.rank}`}><td>{entry.rank}</td><td>{entry.displayName}</td><td>{entry.clues}</td><td>{formatTime(entry.elapsedMs)}</td></tr>)}</tbody></table>}
    <p className={styles.reveal}>Wins rank by fewest clues, then fastest time. Equal clue counts and times share a rank. Guests and practice rounds are excluded.</p>
    <div className={styles.actions}><Link className={styles.button} href="/runes">Play Read the Runes</Link><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/runes/stats">Your archive</Link></div>
  </section></div></main>;
}

export function RunesStats() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRunesStats>> | null>(null);
  const [errorState, setErrorState] = useState<{ userId: string; message: string } | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void fetchRunesStats(controller.signal).then((next) => {
      if (!controller.signal.aborted) { setData(next); setLoadedFor(user.id); setErrorState(null); }
    }).catch((cause) => {
      if (!controller.signal.aborted) setErrorState({ userId: user.id, message: cause instanceof Error ? cause.message : "Your archive could not be loaded." });
    });
    return () => controller.abort();
  }, [user]);
  const loading = Boolean(user && loadedFor !== user.id && errorState?.userId !== user.id);
  const error = errorState && errorState.userId === user?.id ? errorState.message : null;
  return <main className={styles.experience}><div className={styles.content}><section className={`${styles.panel} ${styles.help}`}>
    <p className={styles.eyebrow}>Read the Runes</p><h1 className={styles.title}>Your archive</h1>
    {authLoading || loading ? <p role="status">Loading your Runes archive…</p> : !user ? <p>Sign in to see your Runes wins and losses. Guest rounds are not saved.</p> : error ? <p role="alert" className={styles.error}>{error}</p> : data && <>
      <div className={styles.helpGrid}>
        <div><h2>Rounds</h2><p>{data.games}</p></div><div><h2>Wins</h2><p>{data.wins}</p></div><div><h2>Losses</h2><p>{data.losses} · {Math.round(data.winRate * 100)}% win rate</p></div>
      </div>
      <h2>Wins by clues used</h2>
      {data.winClueDistribution.length ? <table className={styles.table}><thead><tr><th scope="col">Clues</th><th scope="col">Wins</th></tr></thead><tbody>{[...data.winClueDistribution].sort((a,b) => a.clues-b.clues).map(({clues,count}) => <tr key={clues}><td>{clues}</td><td>{count}</td></tr>)}</tbody></table> : <p>No wins recorded yet.</p>}
      <h2>Best win</h2><p>{data.best ? `${data.best.clues} clues · ${formatTime(data.best.elapsedMs)}` : "No win record yet."}</p>
    </>}
    <div className={styles.actions}><Link className={styles.button} href="/runes">Play Read the Runes</Link><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/runes/leaderboard">Leaderboard</Link></div>
  </section></div></main>;
}
