"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { fetchTomeLeaderboard, type TomeStandings } from "./tome-client";
import styles from "./tome.module.css";

function Standings({ userId }: { userId: string | null }) {
  const [standings, setStandings] = useState<TomeStandings | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTomeLeaderboard(userId !== null, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setStandings(data);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [userId, attempt]);

  if (failed) {
    return (
      <>
        <p role="alert">The standings could not be loaded.</p>
        <Button type="button" variant="outline" className={styles.secondary} onClick={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}>Try again</Button>
      </>
    );
  }
  if (!standings) return <p role="status">Loading standings…</p>;

  const { personalBest, entries } = standings;
  return (
    <>
      {userId ? (
        <section aria-label="Your best score">
          <h2>Your best</h2>
          <p>{personalBest ? `${personalBest.score} of 8 correct · Rank ${personalBest.rank}` : "Complete a trivia session to record your first score."}</p>
        </section>
      ) : <p>Sign in before playing to save your score.</p>}
      {entries.length === 0 ? <p>No scores yet.</p> : (
        <table className={styles.standings}>
          <caption className="sr-only">Tome of Fyendal standings</caption>
          <thead>
            <tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Best score</th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.userId} data-personal={entry.userId === userId || undefined}>
                <td>{entry.rank}</td>
                <th scope="row"><Link href={`/u/${encodeURIComponent(entry.userId)}`}>{entry.displayName}</Link></th>
                <td>{entry.score} / 8</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function TomeLeaderboard() {
  const { user, isLoading } = useAuth();

  return (
    <div className={styles.tome}>
      <section className={`${styles.panel} ${styles.session}`} aria-labelledby="tome-leaderboard-title">
        <h1 id="tome-leaderboard-title" className="font-display text-3xl">Tome of Fyendal Leaderboard</h1>
        {isLoading ? <p role="status">Loading standings…</p> : <Standings key={user?.id ?? "guest"} userId={user?.id ?? null} />}
      </section>
    </div>
  );
}
